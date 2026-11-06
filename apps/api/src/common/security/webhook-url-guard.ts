import { lookup as dnsLookup, LookupAddress } from 'dns';
import * as http from 'http';
import * as https from 'https';
import { BlockList, isIP } from 'net';

/**
 * Garde anti-SSRF des webhooks sortants.
 *
 * L'URL d'un endpoint est choisie par le marchand : sans contrôle, l'API
 * pourrait être poussée à appeler son propre réseau (métadonnées cloud
 * 169.254.169.254, Postgres, Redis, services internes). Règles :
 *  - https obligatoire en live (http toléré en test) ;
 *  - le nom est résolu (toutes les adresses) et TOUTES doivent être publiques ;
 *  - la connexion se fait sur l'adresse validée : la validation a lieu dans le
 *    `lookup` du socket lui-même, il n'y a donc pas de fenêtre entre contrôle
 *    et connexion (DNS rebinding) ;
 *  - aucune redirection n'est suivie (http.request ne les suit jamais).
 *
 * Seule exception, désactivée par défaut : WEBHOOKS_ALLOW_LOCALHOST=true
 * autorise le bouclage (127.0.0.0/8, ::1) pour les endpoints de TEST, hors
 * production, afin de développer en local.
 */

export class WebhookUrlRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookUrlRejectedError';
  }
}

// Une liste par famille : BlockList fait correspondre une IPv4 aux règles IPv6
// « ::ffff:0:0/96 » (et inversement), ce qui mélangerait les deux familles.
const BLOCKED_V4 = new BlockList();
const BLOCKED_V6 = new BlockList();
// IPv4 non publiques (RFC 6890 et voisines).
for (const [net, prefix] of [
  ['0.0.0.0', 8], // « ce réseau »
  ['10.0.0.0', 8], // privé
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // bouclage
  ['169.254.0.0', 16], // link-local (métadonnées cloud)
  ['172.16.0.0', 12], // privé
  ['192.0.0.0', 24], // affectations IETF
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // relais 6to4
  ['192.168.0.0', 16], // privé
  ['198.18.0.0', 15], // bancs de test
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // réservé + diffusion
] as const) {
  BLOCKED_V4.addSubnet(net, prefix, 'ipv4');
}
// IPv6 non publiques. Les formes qui embarquent une IPv4 (mappée, compatible,
// NAT64) sont refusées en bloc : elles peuvent désigner une IPv4 interne.
for (const [net, prefix] of [
  ['::', 96], // non spécifiée, bouclage ::1, IPv4-compatible (obsolète)
  ['::ffff:0:0', 96], // IPv4 mappée
  ['::ffff:0:0:0', 96], // IPv4 traduite (SIIT)
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // NAT64 local
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // ULA
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local (obsolète)
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED_V6.addSubnet(net, prefix, 'ipv6');
}

const LOOPBACK_V4 = new BlockList();
LOOPBACK_V4.addSubnet('127.0.0.0', 8, 'ipv4');
const LOOPBACK_V6 = new BlockList();
LOOPBACK_V6.addAddress('::1', 'ipv6');

export interface WebhookGuardOptions {
  livemode: boolean;
  /** Variables d'environnement (injectables pour les tests). */
  env?: NodeJS.ProcessEnv;
}

/** Exception de développement local : test uniquement, jamais en production. */
export function localhostAllowed(opts: WebhookGuardOptions): boolean {
  const env = opts.env ?? process.env;
  return !opts.livemode && env.WEBHOOKS_ALLOW_LOCALHOST === 'true' && env.NODE_ENV !== 'production';
}

/** Vrai si l'adresse IP ne peut pas recevoir de webhook. */
export function isBlockedAddress(address: string, opts: WebhookGuardOptions): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 4) {
    if (localhostAllowed(opts) && LOOPBACK_V4.check(address, 'ipv4')) return false;
    return BLOCKED_V4.check(address, 'ipv4');
  }
  if (localhostAllowed(opts) && LOOPBACK_V6.check(address, 'ipv6')) return false;
  return BLOCKED_V6.check(address, 'ipv6');
}

/** Contrôles statiques de l'URL (schéma, identifiants) ; renvoie l'URL analysée. */
export function parseWebhookUrl(raw: string, opts: WebhookGuardOptions): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlRejectedError('URL invalide');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new WebhookUrlRejectedError('Seuls les schémas http et https sont acceptés');
  }
  if (opts.livemode && url.protocol !== 'https:') {
    throw new WebhookUrlRejectedError('En mode live, l’URL doit être en https');
  }
  if (url.username || url.password) {
    throw new WebhookUrlRejectedError('L’URL ne doit pas contenir d’identifiants');
  }
  return url;
}

export type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

const systemLookupAll: LookupAll = (hostname) =>
  new Promise((resolve, reject) =>
    dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses))),
  );

/**
 * Résout le nom et exige que TOUTES les adresses soient publiques (un seul
 * enregistrement interne suffit à refuser). Renvoie les adresses validées.
 */
export async function resolveDeliverableAddresses(
  hostname: string,
  opts: WebhookGuardOptions,
  lookupAll: LookupAll = systemLookupAll,
): Promise<LookupAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isBlockedAddress(host, opts)) throw new WebhookUrlRejectedError('Adresse de destination non publique');
    return [{ address: host, family: isIP(host) }];
  }
  let addresses: LookupAddress[];
  try {
    addresses = await lookupAll(host);
  } catch {
    throw new WebhookUrlRejectedError('Nom de domaine introuvable');
  }
  if (addresses.length === 0) throw new WebhookUrlRejectedError('Nom de domaine introuvable');
  if (addresses.some((a) => isBlockedAddress(a.address, opts))) {
    throw new WebhookUrlRejectedError('Adresse de destination non publique');
  }
  return addresses;
}

/** Validation complète d'une URL de webhook (enregistrement d'un endpoint). */
export async function assertDeliverableWebhookUrl(
  raw: string,
  opts: WebhookGuardOptions,
  lookupAll: LookupAll = systemLookupAll,
): Promise<URL> {
  const url = parseWebhookUrl(raw, opts);
  await resolveDeliverableAddresses(url.hostname, opts, lookupAll);
  return url;
}

export interface WebhookPostResult {
  status: number;
  body: string;
}

export interface WebhookPostOptions extends WebhookGuardOptions {
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  /** Taille maximale de réponse conservée (octets). */
  maxResponseBytes?: number;
  lookupAll?: LookupAll;
}

/**
 * POST d'un webhook avec connexion épinglée sur une adresse validée.
 *
 * Le `lookup` passé au socket résout le nom puis applique le filtre : l'adresse
 * effectivement connectée est celle qui a été contrôlée. Les redirections ne
 * sont jamais suivies (le statut 3xx est renvoyé tel quel à l'appelant).
 */
export async function postWebhook(rawUrl: string, opts: WebhookPostOptions): Promise<WebhookPostResult> {
  const url = parseWebhookUrl(rawUrl, opts);
  const lookupAll = opts.lookupAll ?? systemLookupAll;
  // Littéral IP : le socket n'appelle pas `lookup`, on le contrôle ici.
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal)) await resolveDeliverableAddresses(literal, opts, lookupAll);

  const pinnedLookup = (hostname: string, options: any, callback: (...args: any[]) => void) => {
    resolveDeliverableAddresses(hostname, opts, lookupAll).then(
      (addresses) => {
        const wanted = typeof options?.family === 'number' && options.family !== 0
          ? addresses.filter((a) => a.family === options.family)
          : addresses;
        if (wanted.length === 0) return callback(new WebhookUrlRejectedError('Nom de domaine introuvable'));
        if (options?.all) return callback(null, wanted);
        callback(null, wanted[0].address, wanted[0].family);
      },
      (err) => callback(err),
    );
  };

  const client = url.protocol === 'https:' ? https : http;
  const maxBytes = opts.maxResponseBytes ?? 4096;

  return new Promise<WebhookPostResult>((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: { ...opts.headers, 'Content-Length': Buffer.byteLength(opts.body).toString() },
        lookup: pinnedLookup as any,
        agent: false,
        signal: AbortSignal.timeout(opts.timeoutMs),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          if (size >= maxBytes) return;
          chunks.push(chunk);
          size += chunk.length;
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8') }),
        );
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.end(opts.body);
  });
}
