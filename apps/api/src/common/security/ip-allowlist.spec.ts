import { isIpAllowed, parseIpAllowlist } from './ip-allowlist';

describe('parseIpAllowlist', () => {
  it('retourne [] si non défini', () => {
    expect(parseIpAllowlist(undefined)).toEqual([]);
  });
  it('parse une liste CSV en nettoyant', () => {
    expect(parseIpAllowlist('1.2.3.4, 10.0.0.0/8 ')).toEqual(['1.2.3.4', '10.0.0.0/8']);
  });
});

describe('isIpAllowed (ALP-160)', () => {
  it('autorise tout si allowlist vide (pas de restriction)', () => {
    expect(isIpAllowed('8.8.8.8', [])).toBe(true);
  });

  it('match exact IPv4', () => {
    expect(isIpAllowed('41.202.1.5', ['41.202.1.5'])).toBe(true);
    expect(isIpAllowed('41.202.1.6', ['41.202.1.5'])).toBe(false);
  });

  it('match CIDR IPv4', () => {
    expect(isIpAllowed('41.202.1.200', ['41.202.1.0/24'])).toBe(true);
    expect(isIpAllowed('41.202.2.1', ['41.202.1.0/24'])).toBe(false);
  });

  it('gère le préfixe IPv4-mapped IPv6', () => {
    expect(isIpAllowed('::ffff:41.202.1.5', ['41.202.1.5'])).toBe(true);
  });

  it('refuse une IP hors de toutes les entrées', () => {
    expect(isIpAllowed('8.8.8.8', ['41.202.1.0/24', '197.149.0.0/16'])).toBe(false);
  });

  it('CIDR /32 équivaut à un match exact', () => {
    expect(isIpAllowed('41.202.1.5', ['41.202.1.5/32'])).toBe(true);
  });
});
