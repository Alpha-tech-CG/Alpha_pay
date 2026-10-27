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
  // Bytes Prisma attend un Uint8Array<ArrayBuffer> ; nos helpers renvoient un Buffer.
  const emailHash = new Uint8Array(deterministicHash(email));
  const emailEncrypted = new Uint8Array(encryptField(email));
  const merchant = await prisma.merchant.upsert({
    where: { emailHash },
    update: {},
    create: {
      name: 'Alpha-Educ',
      emailEncrypted,
      emailHash,
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

  // ── Données de DÉMO (jamais en prod : main() refuse déjà NODE_ENV=production) ──
  await seedDemo(merchant.id);
}

/** Liens de paiement de démonstration (le jeu complet arrive avec T-102). */
async function seedDemo(demoMerchantId: string) {
  const links: Array<[bigint, string]> = [
    [15_000n, 'Commande démo — 15 000 XAF'],
    [2_500n, 'Abonnement démo — 2 500 XAF'],
  ];
  console.log('
── Démo AlphaPay prête ──');
  console.log(`  Marchand démo : ${demoMerchantId}`);
  for (const [amount, description] of links) {
    const link = await prisma.paymentLink.create({
      data: { amount, currency: 'XAF', description, merchantId: demoMerchantId, livemode: false },
    });
    console.log(`  Lien de paiement : http://localhost:5174/pay/${link.id}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
