/**
 * Typed configuration loaded from environment. Every value the app reads goes
 * through here — no `process.env` scattered across the codebase.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  appUrl: string;
  frontendUrl: string;
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: { url: string; host: string; port: number };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  encryptionKey: string;
  adminToken: string;
  connectors: {
    mtnUseStub: boolean;
    airtelUseStub: boolean;
    libyanBankUseStub: boolean;
    circleUseStub: boolean;
    union54UseStub: boolean;
    unlimintUseStub: boolean;
    wiseUseStub: boolean;
    smileUseStub: boolean;
    sumsubUseStub: boolean;
    atUseStub: boolean;
    fxUseStub: boolean;
    notifyUseStub: boolean;
  };
  fxCacheTtlSeconds: number;
}

const bool = (v: string | undefined, def = true): boolean =>
  v === undefined ? def : v.toLowerCase() === 'true';

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  database: {
    url: process.env.DATABASE_URL ?? '',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'alphapay_db',
    user: process.env.DB_USER ?? 'alphapay',
    password: process.env.DB_PASSWORD ?? 'alphapay',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  adminToken: process.env.ADMIN_API_TOKEN ?? '',
  connectors: {
    mtnUseStub: bool(process.env.MTN_USE_STUB),
    airtelUseStub: bool(process.env.AIRTEL_USE_STUB),
    libyanBankUseStub: bool(process.env.LIBYAN_BANK_USE_STUB),
    circleUseStub: bool(process.env.CIRCLE_USE_STUB),
    union54UseStub: bool(process.env.UNION54_USE_STUB),
    unlimintUseStub: bool(process.env.UNLIMINT_USE_STUB),
    wiseUseStub: bool(process.env.WISE_USE_STUB),
    smileUseStub: bool(process.env.SMILE_USE_STUB),
    sumsubUseStub: bool(process.env.SUMSUB_USE_STUB),
    atUseStub: bool(process.env.AT_USE_STUB),
    fxUseStub: bool(process.env.FX_USE_STUB),
    notifyUseStub: bool(process.env.NOTIFY_USE_STUB),
  },
  fxCacheTtlSeconds: parseInt(process.env.FX_CACHE_TTL_SECONDS ?? '300', 10),
});
