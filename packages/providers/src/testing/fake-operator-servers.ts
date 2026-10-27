import type { HttpClient, HttpRequest, HttpResponse } from '../core/http';

/**
 * Faux serveurs opérateurs pour les tests de contrat des adaptateurs réels.
 * Convention de scénario (alignée sur le mock) : numéro finissant par 0001 →
 * succès, par 0002 → échec ; le statut reste « en attente » tant que
 * `settle()` n'a pas été appelé.
 */
abstract class FakeServer implements HttpClient {
  readonly calls: HttpRequest[] = [];
  tokenCalls = 0;
  settled = false;
  /** Statuts HTTP à renvoyer en priorité, un par appel (panne simulée). */
  readonly failNext: number[] = [];

  settle(): void {
    this.settled = true;
  }

  async request(req: HttpRequest): Promise<HttpResponse> {
    this.calls.push(req);
    const forced = this.failNext.shift();
    if (forced) return { status: forced, data: {}, headers: {} };
    return this.handle(req, new URL(req.url).pathname);
  }

  protected abstract handle(req: HttpRequest, path: string): HttpResponse;

  protected scenario(msisdn: string): 'success' | 'failure' | 'other' {
    if (msisdn.endsWith('0001')) return 'success';
    if (msisdn.endsWith('0002')) return 'failure';
    return 'other';
  }
}

const json = (status: number, data: unknown = {}): HttpResponse => ({ status, data, headers: {} });

export class FakeMtnServer extends FakeServer {
  readonly payments = new Map<string, { msisdn: string; externalId: string }>();

  constructor(private readonly creds = { subscriptionKey: 'sub', apiUserId: 'user', apiKey: 'key' }) {
    super();
  }

  protected handle(req: HttpRequest, path: string): HttpResponse {
    const h = req.headers ?? {};
    if (h['Ocp-Apim-Subscription-Key'] !== this.creds.subscriptionKey) return json(401);

    if (req.method === 'POST' && path === '/collection/token/') {
      const expected = `Basic ${Buffer.from(`${this.creds.apiUserId}:${this.creds.apiKey}`).toString('base64')}`;
      if (h.Authorization !== expected) return json(401);
      this.tokenCalls++;
      return json(200, { access_token: 'mtn-token', token_type: 'access_token', expires_in: 3600 });
    }
    if (h.Authorization !== 'Bearer mtn-token') return json(401);

    if (req.method === 'POST' && path === '/collection/v1_0/requesttopay') {
      const ref = h['X-Reference-Id'];
      const body = req.body as { externalId: string; payer: { partyId: string }; amount: string };
      if (!ref || !body?.payer?.partyId || !/^\d+(\.\d{1,2})?$/.test(body.amount)) return json(400);
      if (this.payments.has(ref)) return json(409, { code: 'RESOURCE_ALREADY_EXIST' });
      this.payments.set(ref, { msisdn: body.payer.partyId, externalId: body.externalId });
      return json(202);
    }

    const status = /^\/collection\/v1_0\/requesttopay\/(.+)$/.exec(path);
    if (req.method === 'GET' && status) {
      const p = this.payments.get(decodeURIComponent(status[1]));
      if (!p) return json(404);
      const scenario = this.scenario(p.msisdn);
      if (!this.settled || scenario === 'other') return json(200, { status: 'PENDING', externalId: p.externalId });
      return scenario === 'success'
        ? json(200, { status: 'SUCCESSFUL', externalId: p.externalId })
        : json(200, { status: 'FAILED', reason: 'APPROVAL_REJECTED', externalId: p.externalId });
    }

    const active = /^\/collection\/v1_0\/accountholder\/msisdn\/(\d+)\/active$/.exec(path);
    if (req.method === 'GET' && active) return json(200, { result: !active[1].endsWith('0006') });

    return json(404);
  }
}

export class FakeAirtelServer extends FakeServer {
  readonly payments = new Map<string, { msisdn: string }>();

  constructor(private readonly creds = { clientId: 'cid', clientSecret: 'secret' }) {
    super();
  }

  protected handle(req: HttpRequest, path: string): HttpResponse {
    const h = req.headers ?? {};
    if (req.method === 'POST' && path === '/auth/oauth2/token') {
      const b = req.body as { client_id?: string; client_secret?: string };
      if (b?.client_id !== this.creds.clientId || b?.client_secret !== this.creds.clientSecret) return json(401);
      this.tokenCalls++;
      return json(200, { access_token: 'airtel-token', expires_in: 180, token_type: 'bearer' });
    }
    if (h.Authorization !== 'Bearer airtel-token' || h['X-Country'] !== 'CG') return json(401);

    if (req.method === 'POST' && path === '/merchant/v2/payments/') {
      const b = req.body as { subscriber: { msisdn: string }; transaction: { id: string; amount: number } };
      // Airtel attend le numéro national (sans 242).
      if (!b?.transaction?.id || !/^0\d{8}$/.test(b.subscriber?.msisdn ?? '')) return json(400);
      if (this.payments.has(b.transaction.id)) return json(409);
      this.payments.set(b.transaction.id, { msisdn: b.subscriber.msisdn });
      return json(200, { data: { transaction: { id: b.transaction.id, status: 'Success.' } }, status: { success: true, code: '200' } });
    }

    const status = /^\/standard\/v1\/payments\/(.+)$/.exec(path);
    if (req.method === 'GET' && status) {
      const p = this.payments.get(decodeURIComponent(status[1]));
      if (!p) return json(404);
      const scenario = this.scenario(p.msisdn);
      const code = !this.settled || scenario === 'other' ? 'TIP' : scenario === 'success' ? 'TS' : 'TF';
      return json(200, { data: { transaction: { id: status[1], status: code, message: code === 'TF' ? 'Refusé' : '' } } });
    }

    const user = /^\/standard\/v1\/users\/(\d+)$/.exec(path);
    if (req.method === 'GET' && user) {
      return json(200, { data: { first_name: 'Jean', last_name: 'M.', is_barred: user[1].endsWith('0006') } });
    }

    return json(404);
  }
}
