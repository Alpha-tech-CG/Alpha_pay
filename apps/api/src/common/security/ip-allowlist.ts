/**
 * Allowlist d'IP (ALP-160) — défense en profondeur, secondaire au WAF.
 *
 * Le filtrage autoritatif des IP MTN/Airtel doit se faire au WAF (Cloudflare/ALB,
 * cf. terraform/waf.tf + docs/IP_ALLOWLIST.md). Ce module fournit une barrière
 * applicative additionnelle, activée seulement si une allowlist est configurée.
 *
 * Supporte les IPv4 exactes et les blocs CIDR IPv4 (a.b.c.d/n). Les entrées IPv6
 * ne sont gérées qu'en correspondance exacte (les plages opérateur sont IPv4).
 */

export function parseIpAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Retire le préfixe IPv4-mapped IPv6 (::ffff:1.2.3.4 → 1.2.3.4). */
function normalize(ip: string): string {
  return ip.replace(/^::ffff:/i, '').trim();
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let acc = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    acc = (acc << 8) + n;
  }
  return acc >>> 0;
}

function matchesCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * @returns true si l'allowlist est vide (= pas de restriction) OU si l'IP y figure.
 */
export function isIpAllowed(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  const norm = normalize(ip);
  for (const entry of allowlist) {
    if (entry.includes('/')) {
      if (matchesCidr(norm, entry)) return true;
    } else if (normalize(entry) === norm) {
      return true;
    }
  }
  return false;
}
