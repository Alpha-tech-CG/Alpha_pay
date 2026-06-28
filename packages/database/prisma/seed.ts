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
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
