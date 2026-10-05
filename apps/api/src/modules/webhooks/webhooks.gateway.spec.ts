import { UnauthorizedException } from '@nestjs/common';
import { WebSocket } from 'ws';
import { WebhooksGateway } from './webhooks.gateway';

const canActivate = jest.fn();
jest.mock('../../common/guards/api-key.guard', () => ({
  ApiKeyGuard: jest.fn().mockImplementation(() => ({ canActivate })),
}));

function fakeClient() {
  return { readyState: WebSocket.OPEN, send: jest.fn(), close: jest.fn() } as any;
}

function upgradeRequest(headers: Record<string, string> = {}) {
  return { headers, socket: { remoteAddress: '10.0.0.9' } } as any;
}

/** Simule ApiKeyGuard : authentifie la clé `key-<merchant>` et pose merchant/scopes. */
function authenticateAs(scopesByKey: Record<string, string[]> = {}) {
  canActivate.mockImplementation(async (context: any) => {
    const req = context.switchToHttp().getRequest();
    const key: string | undefined = req.headers['x-api-key'];
    if (!key?.startsWith('key-')) throw new UnauthorizedException();
    req.merchant = { id: key.slice(4) };
    req.apiKeyScopes = scopesByKey[key] ?? [];
    return true;
  });
}

describe('WebhooksGateway (isolation multi-tenant)', () => {
  let gateway: WebhooksGateway;
  const sent = (client: any) => client.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw));

  beforeEach(() => {
    canActivate.mockReset();
    delete process.env.REDIS_URL;
    gateway = new WebhooksGateway({} as any);
    gateway.server = { clients: new Set() } as any;
    authenticateAs();
  });

  async function connect(headers: Record<string, string>) {
    const client = fakeClient();
    (gateway.server.clients as Set<any>).add(client);
    await gateway.handleConnection(client, upgradeRequest(headers));
    return client;
  }

  // Régression sécurité : la connexion était anonyme et chaque mise à jour de
  // transaction était diffusée à TOUS les clients connectés.
  it('ferme la connexion sans clé API valide et ne lui délivre rien', async () => {
    const anonymous = await connect({});

    gateway.broadcastToMerchant('m-1', 'transaction_update', { externalId: 'ext-1' });

    expect(anonymous.close).toHaveBeenCalledWith(1008, 'Unauthorized');
    expect(anonymous.send).not.toHaveBeenCalled();
  });

  it("ne délivre un événement qu'aux clients du marchand concerné", async () => {
    const alice = await connect({ 'x-api-key': 'key-m-1' });
    const bob = await connect({ 'x-api-key': 'key-m-2' });

    gateway.broadcastToMerchant('m-1', 'transaction_update', { externalId: 'ext-1', status: 'SUCCESSFUL' });

    expect(sent(alice).map((m: any) => m.event)).toEqual(['connected', 'transaction_update']);
    expect(sent(bob).map((m: any) => m.event)).toEqual(['connected']);
    // L'identifiant du marchand ne sort pas dans le message délivré.
    expect(sent(alice)[1]).toEqual({
      event: 'transaction_update',
      data: { externalId: 'ext-1', status: 'SUCCESSFUL' },
      ts: expect.any(Number),
    });
  });

  it('refuse une clé restreinte sans le scope payments:read', async () => {
    authenticateAs({ 'key-m-1': ['paylinks:write'] });
    const client = await connect({ 'x-api-key': 'key-m-1' });
    expect(client.close).toHaveBeenCalledWith(1008, 'Unauthorized');
  });

  it("évalue l'allowlist IP sur la dernière entrée de X-Forwarded-For (trust proxy = 1)", async () => {
    await connect({ 'x-api-key': 'key-m-1', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' });
    const req = canActivate.mock.calls[0][0].switchToHttp().getRequest();
    expect(req.ip).toBe('203.0.113.7');
  });

  it("ne délivre à personne un message Redis sans marchand (fail-closed)", async () => {
    const alice = await connect({ 'x-api-key': 'key-m-1' });
    (gateway as any).deliverLocal(JSON.stringify({ event: 'transaction_update', data: {}, ts: 1 }));
    expect(sent(alice).map((m: any) => m.event)).toEqual(['connected']);
  });
});
