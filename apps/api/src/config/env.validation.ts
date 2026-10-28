/**
 * Validation de la configuration au démarrage (T-14) : l'API et le worker
 * refusent de démarrer avec une configuration incomplète ou incohérente, en
 * nommant chaque variable fautive. Documentation : `.env.example`.
 */
type Env = NodeJS.ProcessEnv;

function base64Key32(env: Env, name: string, problems: string[]): void {
  const v = env[name];
  if (!v) return;
  if (Buffer.from(v, 'base64').length !== 32) problems.push(`${name} doit être une clé base64 de 32 octets`);
}

function oneOf(env: Env, name: string, allowed: string[], problems: string[]): void {
  const v = env[name];
  if (v !== undefined && v !== '' && !allowed.includes(v)) problems.push(`${name} doit valoir ${allowed.join(' | ')} (reçu « ${v} »)`);
}

function positiveInt(env: Env, name: string, problems: string[]): void {
  const v = env[name];
  if (v !== undefined && v !== '' && !(Number.isInteger(Number(v)) && Number(v) > 0)) problems.push(`${name} doit être un entier positif`);
}

function minLength(env: Env, name: string, min: number, problems: string[]): void {
  const v = env[name];
  if (v && v.length < min) problems.push(`${name} doit compter au moins ${min} caractères`);
}

/** Variables exigées en production (préproduction comprise). */
const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'REDIS_URL',
  'PUBLIC_API_URL',
  'PII_ENCRYPTION_KEY',
  'PROVIDER_CREDENTIALS_KEY',
  'DOCUMENTS_ENCRYPTION_KEY',
  'API_KEY_PEPPER',
  'INTERNAL_API_TOKEN',
  'ALLOWED_ORIGINS',
  'OTP_HMAC_SECRET',
  'JWT_SECRET',
  'CALLBACK_SIGNING_SECRET',
];

export function validateEnv(env: Env = process.env): void {
  const problems: string[] = [];

  oneOf(env, 'NODE_ENV', ['development', 'test', 'production'], problems);
  oneOf(env, 'MOBILE_MONEY_TEST_PROVIDER', ['mock', 'sandbox'], problems);
  oneOf(env, 'MTN_SANDBOX_CURRENCY', ['EUR', 'XAF'], problems);
  oneOf(env, 'FEATURE_CARD_PAYMENTS', ['true', 'false'], problems);
  oneOf(env, 'SMS_PROVIDER', ['mock', 'infobip'], problems);
  oneOf(env, 'WHATSAPP_PROVIDER', ['mock', 'meta'], problems);
  oneOf(env, 'EMAIL_PROVIDER', ['mock', 'smtp'], problems);
  oneOf(env, 'KYC_PROVIDER', ['mock', 'sumsub'], problems);
  oneOf(env, 'STORAGE_DRIVER', ['local', 's3'], problems);
  oneOf(env, 'LOG_LEVEL', ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], problems);
  positiveInt(env, 'PORT', problems);
  positiveInt(env, 'PAYMENT_EXPIRY_SECONDS', problems);
  base64Key32(env, 'PII_ENCRYPTION_KEY', problems);
  base64Key32(env, 'PROVIDER_CREDENTIALS_KEY', problems);
  base64Key32(env, 'DOCUMENTS_ENCRYPTION_KEY', problems);
  minLength(env, 'API_KEY_PEPPER', 32, problems);
  minLength(env, 'INTERNAL_API_TOKEN', 32, problems);
  minLength(env, 'OTP_HMAC_SECRET', 32, problems);
  minLength(env, 'JWT_SECRET', 32, problems);
  minLength(env, 'CALLBACK_SIGNING_SECRET', 32, problems);
  positiveInt(env, 'OTP_MAX_PER_DESTINATION_PER_HOUR', problems);
  positiveInt(env, 'OTP_MAX_PER_IP_PER_HOUR', problems);

  if (env.SMS_PROVIDER === 'infobip') {
    for (const name of ['INFOBIP_BASE_URL', 'INFOBIP_API_KEY', 'MESSAGING_WEBHOOK_TOKEN']) if (!env[name]) problems.push(`${name} est requis avec SMS_PROVIDER=infobip`);
  }
  if (env.WHATSAPP_PROVIDER === 'meta') {
    for (const name of ['WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN']) {
      if (!env[name]) problems.push(`${name} est requis avec WHATSAPP_PROVIDER=meta`);
    }
  }
  if (env.EMAIL_PROVIDER === 'smtp') {
    for (const name of ['SMTP_URL', 'EMAIL_FROM']) if (!env[name]) problems.push(`${name} est requis avec EMAIL_PROVIDER=smtp`);
  }
  if (!!env.VAPID_PUBLIC_KEY !== !!env.VAPID_PRIVATE_KEY) problems.push('VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY vont ensemble');
  if (env.VAPID_SUBJECT && !/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT)) problems.push('VAPID_SUBJECT : mailto: ou URL https');
  if (env.KYC_PROVIDER === 'sumsub') {
    for (const name of ['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY', 'SUMSUB_WEBHOOK_SECRET', 'SUMSUB_LEVEL_NAME']) if (!env[name]) problems.push(`${name} est requis avec KYC_PROVIDER=sumsub`);
  }
  if (env.STORAGE_DRIVER === 's3' && !env.STORAGE_BUCKET) problems.push('STORAGE_BUCKET est requis avec STORAGE_DRIVER=s3');
  if (env.MESSAGE_CREDIT_COSTS) {
    try {
      JSON.parse(env.MESSAGE_CREDIT_COSTS);
    } catch {
      problems.push('MESSAGE_CREDIT_COSTS doit être un JSON, ex. {"SMS":1,"WHATSAPP":1,"EMAIL":1}');
    }
  }
  if (env.PHONE_OPERATOR_PREFIXES) {
    try {
      JSON.parse(env.PHONE_OPERATOR_PREFIXES);
    } catch {
      problems.push('PHONE_OPERATOR_PREFIXES doit être un JSON, ex. {"MTN":["06"],"AIRTEL":["05","04"]}');
    }
  }
  for (const name of ['DATABASE_URL', 'REDIS_URL', 'PUBLIC_API_URL']) {
    const v = env[name];
    if (v) {
      try {
        new URL(v);
      } catch {
        problems.push(`${name} doit être une URL valide`);
      }
    }
  }

  if (env.NODE_ENV === 'production') {
    for (const name of REQUIRED_IN_PRODUCTION) if (!env[name]) problems.push(`${name} est requis en production`);
    if (env.PII_ENCRYPTION_KEY && env.PII_ENCRYPTION_KEY === env.PROVIDER_CREDENTIALS_KEY) {
      problems.push('PROVIDER_CREDENTIALS_KEY doit être distincte de PII_ENCRYPTION_KEY');
    }
  }

  if (problems.length > 0) {
    throw new Error(`Configuration invalide (voir .env.example) :\n  - ${problems.join('\n  - ')}`);
  }
}
