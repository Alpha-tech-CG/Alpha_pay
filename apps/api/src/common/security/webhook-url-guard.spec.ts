import * as http from 'http';
import { AddressInfo } from 'net';
import {
  assertDeliverableWebhookUrl,
  isBlockedAddress,
  LookupAll,
  parseWebhookUrl,
  postWebhook,
  resolveDeliverableAddresses,
  WebhookUrlRejectedError,
} from './webhook-url-guard';

const LIVE = { livemode: true, env: {} };
const TEST = { livemode: false, env: {} };
const TEST_LOCAL = { livemode: false, env: { WEBHOOKS_ALLOW_LOCALHOST: 'true', NODE_ENV: 'development' } };

const fakeDns = (table: Record<string, string[]>): LookupAll => async (host) => {
  const ips = table[host];
  if (!ips) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  return ips.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

describe('webhook-url-guard : adresses refusées', () => {
  it.each([
    '127.0.0.1', '127.255.255.254', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', // métadonnées cloud
    '100.64.0.1', '100.127.255.255', // CGNAT
    '0.0.0.0', '0.1.2.3',
    '224.0.0.1', '255.255.255.255', '198.18.0.1',
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254', '::ffff:10.0.0.1', // IPv4 mappées
    '::127.0.0.1', // IPv4-compatible
    '64:ff9b::a00:1', // NAT64 vers 10.0.0.1
    'pas-une-ip',
  ])('%s est refusée', (ip) => {
    expect(isBlockedAddress(ip, LIVE)).toBe(true);
    expect(isBlockedAddress(ip, TEST)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.215.14', '100.63.255.255', '100.128.0.0', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4007::64'])(
    '%s (publique) est acceptée',
    (ip) => expect(isBlockedAddress(ip, LIVE)).toBe(false),
  );
});

describe('webhook-url-guard : exception localhost (dev local)', () => {
  it('désactivée par défaut, même en test', () => {
    expect(isBlockedAddress('127.0.0.1', { livemode: false, env: { NODE_ENV: 'development' } })).toBe(true);
  });

  it('activée par WEBHOOKS_ALLOW_LOCALHOST=true : bouclage seulement, en test seulement', () => {
    expect(isBlockedAddress('127.0.0.1', TEST_LOCAL)).toBe(false);
    expect(isBlockedAddress('::1', TEST_LOCAL)).toBe(false);
    // N'ouvre pas le reste du réseau interne.
    expect(isBlockedAddress('10.0.0.1', TEST_LOCAL)).toBe(true);
    expect(isBlockedAddress('169.254.169.254', TEST_LOCAL)).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1', TEST_LOCAL)).toBe(true);
    // Jamais en live.
    expect(isBlockedAddress('127.0.0.1', { ...TEST_LOCAL, livemode: true })).toBe(true);
  });

  it('ignorée en production', () => {
    expect(isBlockedAddress('127.0.0.1', { livemode: false, env: { WEBHOOKS_ALLOW_LOCALHOST: 'true', NODE_ENV: 'production' } })).toBe(true);
  });
});

describe('webhook-url-guard : schéma de l’URL', () => {
  it('https obligatoire en live, http toléré en test', () => {
    expect(() => parseWebhookUrl('http://example.com/hook', LIVE)).toThrow(WebhookUrlRejectedError);
    expect(parseWebhookUrl('https://example.com/hook', LIVE).hostname).toBe('example.com');
    expect(parseWebhookUrl('http://example.com/hook', TEST).hostname).toBe('example.com');
  });

  it('refuse les autres schémas, les identifiants et les URL invalides', () => {
    expect(() => parseWebhookUrl('ftp://example.com/', TEST)).toThrow(WebhookUrlRejectedError);
    expect(() => parseWebhookUrl('file:///etc/passwd', TEST)).toThrow(WebhookUrlRejectedError);
    expect(() => parseWebhookUrl('https://user:pass@example.com/', LIVE)).toThrow(WebhookUrlRejectedError);
    expect(() => parseWebhookUrl('pas une url', LIVE)).toThrow(WebhookUrlRejectedError);
  });
});

describe('webhook-url-guard : résolution DNS', () => {
  const dns = fakeDns({
    'public.example': ['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'],
    'interne.example': ['127.0.0.1'],
    'metadata.example': ['169.254.169.254'],
    'mixte.example': ['93.184.215.14', '10.0.0.7'],
    'mapped.example': ['::ffff:127.0.0.1'],
  });

  it('accepte un nom dont toutes les adresses sont publiques', async () => {
    await expect(resolveDeliverableAddresses('public.example', LIVE, dns)).resolves.toHaveLength(2);
  });

  it.each(['interne.example', 'metadata.example', 'mixte.example', 'mapped.example'])(
    'refuse %s (au moins une adresse non publique)',
    async (host) => {
      await expect(assertDeliverableWebhookUrl(`https://${host}/hook`, LIVE, dns)).rejects.toThrow('non publique');
      await expect(assertDeliverableWebhookUrl(`https://${host}/hook`, TEST, dns)).rejects.toThrow('non publique');
    },
  );

  it('refuse un nom introuvable', async () => {
    await expect(assertDeliverableWebhookUrl('https://inconnu.example/hook', LIVE, dns)).rejects.toThrow('introuvable');
  });

  it.each(['https://127.0.0.1/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[::ffff:a9fe:a9fe]/', 'https://0x7f000001/', 'https://2130706433/'])(
    'refuse le littéral %s sans résolution',
    async (url) => {
      const lookup = jest.fn();
      await expect(assertDeliverableWebhookUrl(url, LIVE, lookup)).rejects.toThrow(WebhookUrlRejectedError);
      expect(lookup).not.toHaveBeenCalled();
    },
  );
});

describe('webhook-url-guard : postWebhook (connexion épinglée, sans redirection)', () => {
  let server: http.Server;
  let port: number;
  let hits: Array<{ url?: string; body: string }>;

  beforeAll(async () => {
    hits = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        hits.push({ url: req.url, body });
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: `http://127.0.0.1:${port}/cible` }).end();
          return;
        }
        res.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => (hits = []));

  const post = (url: string, opts: object) => postWebhook(url, { headers: { 'Content-Type': 'application/json' }, body: '{"a":1}', timeoutMs: 5000, ...TEST, ...opts });

  it('refuse localhost sans l’exception, avant toute connexion', async () => {
    await expect(post(`http://127.0.0.1:${port}/hook`, {})).rejects.toThrow(WebhookUrlRejectedError);
    await expect(post(`http://localhost:${port}/hook`, {})).rejects.toThrow(WebhookUrlRejectedError);
    expect(hits).toHaveLength(0);
  });

  it('livre en local avec l’exception de développement', async () => {
    const res = await post(`http://127.0.0.1:${port}/hook`, TEST_LOCAL);
    expect(res).toEqual({ status: 200, body: 'ok' });
    expect(hits).toEqual([{ url: '/hook', body: '{"a":1}' }]);
  });

  it('ne suit pas les redirections (statut 3xx renvoyé, cible jamais appelée)', async () => {
    const res = await post(`http://127.0.0.1:${port}/redirect`, TEST_LOCAL);
    expect(res.status).toBe(302);
    expect(hits.map((h) => h.url)).toEqual(['/redirect']);
  });

  it('valide l’adresse au moment de la connexion (DNS rebinding) et s’y connecte', async () => {
    // Le nom pointe vers 127.0.0.1 au moment de l'envoi : refusé, aucune connexion.
    const rebind = fakeDns({ 'rebind.example': ['127.0.0.1'] });
    await expect(post(`http://rebind.example:${port}/hook`, { lookupAll: rebind })).rejects.toThrow(WebhookUrlRejectedError);
    expect(hits).toHaveLength(0);

    // Avec l'exception, la connexion se fait bien sur l'adresse validée.
    const res = await post(`http://rebind.example:${port}/hook`, { ...TEST_LOCAL, lookupAll: rebind });
    expect(res.status).toBe(200);
    expect(hits).toHaveLength(1);
  });

  it('refuse http en live avant toute connexion', async () => {
    await expect(post(`http://127.0.0.1:${port}/hook`, { ...TEST_LOCAL, livemode: true })).rejects.toThrow('https');
    expect(hits).toHaveLength(0);
  });
});
