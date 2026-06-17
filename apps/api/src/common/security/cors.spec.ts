import { buildCorsOptions, parseAllowedOrigins } from './cors';

describe('parseAllowedOrigins (ALP-155)', () => {
  it('retombe sur les origines de dev si ALLOWED_ORIGINS absent', () => {
    expect(parseAllowedOrigins({} as NodeJS.ProcessEnv)).toContain('http://localhost:5173');
  });

  it('parse une liste séparée par virgules en nettoyant les espaces', () => {
    const env = { ALLOWED_ORIGINS: 'https://app.paybrain.cg, https://dash.paybrain.cg' } as NodeJS.ProcessEnv;
    expect(parseAllowedOrigins(env)).toEqual(['https://app.paybrain.cg', 'https://dash.paybrain.cg']);
  });

  it('ignore un wildcard glissé dans la liste', () => {
    const env = { ALLOWED_ORIGINS: 'https://app.paybrain.cg, *' } as NodeJS.ProcessEnv;
    expect(parseAllowedOrigins(env)).toEqual(['https://app.paybrain.cg']);
  });
});

describe('buildCorsOptions (ALP-155)', () => {
  const env = { ALLOWED_ORIGINS: 'https://app.paybrain.cg' } as NodeJS.ProcessEnv;
  const originFn = buildCorsOptions(env).origin as (
    origin: string | undefined,
    cb: (err: Error | null, allow?: boolean) => void,
  ) => void;

  function check(origin: string | undefined): boolean {
    let allowed = false;
    originFn(origin, (_err, allow) => {
      allowed = !!allow;
    });
    return allowed;
  }

  it('autorise une origine whitelistée', () => {
    expect(check('https://app.paybrain.cg')).toBe(true);
  });

  it('refuse une origine non whitelistée', () => {
    expect(check('https://evil.example.com')).toBe(false);
  });

  it('autorise les appels sans Origin (serveur-à-serveur / curl)', () => {
    expect(check(undefined)).toBe(true);
  });

  it('n\'active pas credentials (réduction surface CSRF)', () => {
    expect(buildCorsOptions(env).credentials).toBeUndefined();
  });
});
