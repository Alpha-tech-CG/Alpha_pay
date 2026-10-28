// Tests d'intégration (§9) : base Postgres RÉELLE dédiée aux tests, fournisseurs
// factices. Exécuté avant tout import, donc avant la création du client Prisma.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://alphapay:alphapay@127.0.0.1:5433/alphapay_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';

// Valeurs VIDES plutôt que supprimées : ConfigModule charge le .env local via
// dotenv, qui n'écrase jamais une variable définie (même vide). Sans cela, un
// REDIS_URL du .env ferait persister compteurs OTP et files d'un essai à l'autre.
for (const name of ['REDIS_URL', 'SMS_PROVIDER', 'WHATSAPP_PROVIDER', 'EMAIL_PROVIDER', 'SECRETS_FILE', 'AWS_SECRETS_MANAGER_SECRET_ID', 'KYC_PROVIDER', 'STORAGE_DRIVER']) {
  process.env[name] = '';
}
process.env.DEV_OUTBOX_ENABLED = 'false';
// Toutes les requêtes de test viennent de 127.0.0.1 : plafond par IP relevé
// (il garde son propre test dans otp.int-spec.ts).
process.env.OTP_MAX_PER_IP_PER_HOUR = '100000';
// Back-office (jeton interne) et pièces KYB sur un disque temporaire.
process.env.INTERNAL_API_TOKEN = 'test-internal-token-0123456789abcdef';
process.env.STORAGE_DIR = require('path').join(require('os').tmpdir(), 'alphapay-test-storage');
process.env.PUBLIC_API_URL = process.env.PUBLIC_API_URL || 'http://localhost:3000';
