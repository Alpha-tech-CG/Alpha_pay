import * as Joi from 'joi';

/**
 * Startup validation. Base infra vars are always required. Each connector's
 * real credentials become required only when its `*_USE_STUB` flag is `false`
 * (Joi `.when(...)`), so a stub-only dev boot needs no third-party keys.
 */
const whenReal = (flag: string, keys: string[]) =>
  keys.reduce<Record<string, Joi.Schema>>((acc, key) => {
    acc[key] = Joi.string().when(flag, { is: 'false', then: Joi.required(), otherwise: Joi.optional() });
    return acc;
  }, {});

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(3000),
  APP_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),

  DATABASE_URL: Joi.string().required(),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().required(),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),

  REDIS_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().required(),

  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_REFRESH_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

  ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
  ADMIN_API_TOKEN: Joi.string().min(16).required(),

  // Connector stub flags
  MTN_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  AIRTEL_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  LIBYAN_BANK_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  CIRCLE_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  UNION54_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  UNLIMINT_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  WISE_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  SMILE_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  SUMSUB_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  AT_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  FX_USE_STUB: Joi.string().valid('true', 'false').default('true'),
  NOTIFY_USE_STUB: Joi.string().valid('true', 'false').default('true'),

  // Real credentials required only when the matching stub flag is false
  ...whenReal('MTN_USE_STUB', ['MTN_API_USER', 'MTN_API_KEY', 'MTN_SUBSCRIPTION_KEY']),
  MTN_ENVIRONMENT: Joi.string().valid('sandbox', 'production').default('sandbox'),
  MTN_BASE_URL: Joi.string().uri().default('https://sandbox.momodeveloper.mtn.com'),
  ...whenReal('AIRTEL_USE_STUB', ['AIRTEL_CLIENT_ID', 'AIRTEL_CLIENT_SECRET']),
  AIRTEL_BASE_URL: Joi.string().uri().default('https://openapiuat.airtel.africa'),
  ...whenReal('LIBYAN_BANK_USE_STUB', ['WAHDA_BANK_API_KEY', 'BCD_BANK_API_KEY']),
  WAHDA_BANK_BASE_URL: Joi.string().allow('').optional(),
  BCD_BANK_BASE_URL: Joi.string().allow('').optional(),
  ...whenReal('CIRCLE_USE_STUB', ['CIRCLE_API_KEY']),
  CIRCLE_BASE_URL: Joi.string().uri().default('https://api-sandbox.circle.com'),
  ...whenReal('UNION54_USE_STUB', ['UNION54_API_KEY']),
  UNION54_BASE_URL: Joi.string().allow('').optional(),
  ...whenReal('UNLIMINT_USE_STUB', ['UNLIMINT_API_KEY', 'UNLIMINT_SECRET']),
  UNLIMINT_BASE_URL: Joi.string().uri().default('https://sandbox.cardpay.com'),
  ...whenReal('WISE_USE_STUB', ['WISE_API_TOKEN']),
  WISE_BASE_URL: Joi.string().uri().default('https://api.sandbox.transferwise.tech'),
  ...whenReal('SMILE_USE_STUB', ['SMILE_PARTNER_ID', 'SMILE_API_KEY']),
  ...whenReal('SUMSUB_USE_STUB', ['SUMSUB_APP_TOKEN', 'SUMSUB_SECRET_KEY']),
  ...whenReal('AT_USE_STUB', ['AT_API_KEY', 'AT_USERNAME']),
  AT_USSD_CODE: Joi.string().default('*150*00#'),
  ...whenReal('FX_USE_STUB', ['CURRENCYLAYER_API_KEY']),
  FX_CACHE_TTL_SECONDS: Joi.number().default(300),

  // Notifications : SMS via Africa's Talking (réutilise AT_*), email via SendGrid.
  ...whenReal('NOTIFY_USE_STUB', ['SENDGRID_API_KEY']),
  EMAIL_FROM: Joi.string().email().default('noreply@alphapay.co'),
  SMS_SENDER_ID: Joi.string().allow('').default('AlphaPay'),
}).unknown(true);
