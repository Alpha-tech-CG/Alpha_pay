// Tests d'intégration (§9) : base Postgres RÉELLE dédiée aux tests, fournisseurs
// factices. Exécuté avant tout import, donc avant la création du client Prisma.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://alphapay:alphapay@localhost:5433/alphapay_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
delete process.env.REDIS_URL;
delete process.env.SMS_PROVIDER;
delete process.env.WHATSAPP_PROVIDER;
delete process.env.EMAIL_PROVIDER;
process.env.DEV_OUTBOX_ENABLED = 'false';
