import { validateEnv } from './env.validation';

const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');

const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/alphapay',
  REDIS_URL: 'redis://redis:6379',
  PUBLIC_API_URL: 'https://api.alphapay.cg',
  PII_ENCRYPTION_KEY: KEY_A,
  PROVIDER_CREDENTIALS_KEY: KEY_B,
  API_KEY_PEPPER: 'p'.repeat(32),
  INTERNAL_API_TOKEN: 't'.repeat(32),
  ALLOWED_ORIGINS: 'https://app.alphapay.cg',
  OTP_HMAC_SECRET: 'o'.repeat(32),
  JWT_SECRET: 'j'.repeat(32),
};

describe('validateEnv (T-14)', () => {
  it('accepte une configuration de développement minimale (mocks par défaut)', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('accepte une configuration de production complète', () => {
    expect(() => validateEnv(production)).not.toThrow();
  });

  it('nomme chaque variable manquante en production', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(/REDIS_URL est requis en production[\s\S]*PROVIDER_CREDENTIALS_KEY est requis/);
  });

  it('refuse des clés de chiffrement invalides ou identiques', () => {
    expect(() => validateEnv({ ...production, PII_ENCRYPTION_KEY: 'trop-court' })).toThrow(/PII_ENCRYPTION_KEY doit être une clé base64 de 32 octets/);
    expect(() => validateEnv({ ...production, PROVIDER_CREDENTIALS_KEY: KEY_A })).toThrow(/distincte/);
  });

  it.each([
    ['MOBILE_MONEY_TEST_PROVIDER', 'mtn'],
    ['FEATURE_CARD_PAYMENTS', 'oui'],
    ['PAYMENT_EXPIRY_SECONDS', '-5'],
    ['PHONE_OPERATOR_PREFIXES', '{pas du json'],
    ['REDIS_URL', 'pas une url'],
  ])('refuse %s=%s', (name, value) => {
    expect(() => validateEnv({ NODE_ENV: 'development', [name]: value })).toThrow(new RegExp(name));
  });
});

describe('validateEnv — fournisseurs de messages', () => {
  it('exige les identifiants du fournisseur choisi', () => {
    expect(() => validateEnv({ NODE_ENV: 'development', SMS_PROVIDER: 'infobip' })).toThrow(/INFOBIP_API_KEY est requis/);
    expect(() => validateEnv({ NODE_ENV: 'development', WHATSAPP_PROVIDER: 'meta' })).toThrow(/WHATSAPP_APP_SECRET est requis/);
    expect(() => validateEnv({ NODE_ENV: 'development', SMS_PROVIDER: 'twilio' })).toThrow(/SMS_PROVIDER/);
    expect(() => validateEnv({ NODE_ENV: 'development', EMAIL_PROVIDER: 'smtp', SMTP_URL: 'smtp://x:25', EMAIL_FROM: 'a@b.cg' })).not.toThrow();
  });
});
