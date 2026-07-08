import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { deterministicHash, encryptField, normalizeEmail } from '@paybrain/shared';

const prisma = new PrismaClient();

// Mêmes paramètres et pepper que apps/api/src/common/security/api-key.ts :
// le secret est haché avec Argon2id + pepper applicatif. Aucune clé en clair.
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 4,
};

function getPepper(): string {
  const pepper = process.env.API_KEY_PEPPER;
  if (pepper && pepper.length >= 32) return pepper;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_KEY_PEPPER (≥32 chars) requis en production');
  }
  return 'dev-only-pepper-not-for-production-0000000000';
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Le seed ne doit jamais être exécuté en production.');
  }

  const email = normalizeEmail('alpha-educ@paybrain.cg');
  const merchant = await prisma.merchant.upsert({
    where: { emailHash: deterministicHash(email) },
    update: {},
    create: {
      name: 'Alpha-Educ',
      emailEncrypted: encryptField(email),
      emailHash: deterministicHash(email),
      isActive: true,
    },
  });
  console.log('Merchant seed:', merchant.name);

  // Clé API de dev : secret ALÉATOIRE à chaque seed (jamais codé en dur),
  // haché en base. La valeur en clair n'est affichée qu'ici, une seule fois.
  const prefixId = randomBytes(4).toString('hex');
  const secret = randomBytes(24).toString('base64url');
  const prefix = `pk_test_${prefixId}`;
  const full = `${prefix}_${secret}`;
  await prisma.apiKey.create({
    data: {
      merchantId: merchant.id,
      name: 'Dev seed key',
      mode: 'TEST',
      prefix,
      hashedSecret: await argon2.hash(secret + getPepper(), ARGON2_OPTS),
      scopes: [],
      ipAllowlist: [],
    },
  });
  console.log('Clé API de dev (à copier maintenant, non re-consultable) :');
  console.log(`  X-API-Key: ${full}`);

  // Taux de change par défaut (ALP-151). Valeurs indicatives — à alimenter par
  // un flux réel en prod. EUR/XAF est une parité fixe BEAC.
  const rates: Array<[string, string, number]> = [
    ['EUR', 'XAF', 655.957],
    ['USD', 'XAF', 610],
    ['EUR', 'USD', 1.08],
  ];
  for (const [base, quote, rate] of rates) {
    await prisma.currencyRate.upsert({
      where: { base_quote: { base, quote } },
      update: { rate },
      create: { base, quote, rate, source: 'seed' },
    });
  }
  console.log(`Taux de change seedés : ${rates.length}`);

  // ── Plafonds e-money par niveau KYC (ALP-174) ──
  // Upsert (utile si la base est initialisée via `prisma db push`, qui ne joue
  // pas la migration 11). Montants en centimes ×100 (XAF).
  const limits: Array<[
    'N0' | 'N1' | 'N2', bigint, bigint, bigint, bigint,
  ]> = [
    ['N0', 10_000_000n, 5_000_000n, 5_000_000n, 20_000_000n],
    ['N1', 200_000_000n, 50_000_000n, 100_000_000n, 500_000_000n],
    ['N2', 1_000_000_000n, 200_000_000n, 500_000_000n, 2_000_000_000n],
  ];
  for (const [level, maxBalanceCents, perTxCents, dailyCents, monthlyCents] of limits) {
    await prisma.walletLimit.upsert({
      where: { level },
      update: { maxBalanceCents, perTxCents, dailyCents, monthlyCents },
      create: { level, maxBalanceCents, perTxCents, dailyCents, monthlyCents },
    });
  }
  console.log(`Plafonds KYC seedés : ${limits.length} niveaux`);

  // ── Données de DÉMO (jamais en prod : main() refuse déjà NODE_ENV=production) ──
  await seedDemo(merchant.id);
}

/** Crée des wallets vérifiés + des liens de paiement pour tester l'agrégateur. */
async function seedDemo(demoMerchantId: string) {
  const DEMO_PIN = '1234';
  const pinHash = await argon2.hash(DEMO_PIN, ARGON2_OPTS);

  // Deux wallets clients ACTIFS, KYC N1, avec solde (100 000 / 20 000 XAF).
  const wallets: Array<[string, string, bigint]> = [
    ['242066000001', 'Awa Payeuse', 10_000_000n], // 100 000 XAF
    ['242066000002', 'Bina Destinataire', 2_000_000n], // 20 000 XAF
  ];
  for (const [phone, fullName, balanceCents] of wallets) {
    await prisma.wallet.upsert({
      where: { phone },
      update: { balanceCents, status: 'ACTIVE', kycLevel: 'N1', pinHash, fullName },
      create: { phone, fullName, pinHash, balanceCents, currency: 'XAF', status: 'ACTIVE', kycLevel: 'N1' },
    });
  }

  // Un caissier rattaché au marchand démo (peut générer des QR signés).
  await prisma.wallet.upsert({
    where: { phone: '242066000009' },
    update: { role: 'MERCHANT_CASHIER', merchantId: demoMerchantId, status: 'ACTIVE', kycLevel: 'N1', pinHash },
    create: {
      phone: '242066000009', fullName: 'Caissier Démo', pinHash, currency: 'XAF',
      status: 'ACTIVE', kycLevel: 'N1', role: 'MERCHANT_CASHIER', merchantId: demoMerchantId,
    },
  });

  // Deux liens de paiement : un en XAF, un en USD (test multi-devises ALP-170).
  const links: Array<[string, bigint, string, string]> = [
    ['10000001', 1_500_000n, 'XAF', 'Commande démo — 15 000 XAF'],
    ['10000002', 2_500n, 'USD', 'Abonnement démo — 25 USD'],
  ];
  const linkIds: Record<string, string> = {};
  for (const [code, amount, currency, description] of links) {
    const link = await prisma.paymentLink.upsert({
      where: { code },
      update: { amount, currency, description, usedAt: null, merchantId: demoMerchantId },
      create: { code, amount, currency, description, merchantId: demoMerchantId },
    });
    linkIds[currency] = link.id;
  }

  console.log('\n── DÉMO PayBrain prête ──');
  console.log(`  Marchand démo         : ${demoMerchantId}`);
  console.log(`  Wallet payeur         : +242 06 600 0001  PIN ${DEMO_PIN}  (100 000 XAF)`);
  console.log(`  Wallet destinataire   : +242 06 600 0002  PIN ${DEMO_PIN}  (20 000 XAF)`);
  console.log(`  Caissier (QR)         : +242 06 600 0009  PIN ${DEMO_PIN}`);
  console.log(`  Lien de paiement XAF  : http://localhost:5174/pay/${linkIds['XAF']}`);
  console.log(`  Lien de paiement USD  : http://localhost:5174/pay/${linkIds['USD']}`);
  console.log('  (Payez avec le wallet payeur : +242066000001 / PIN 1234)\n');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
