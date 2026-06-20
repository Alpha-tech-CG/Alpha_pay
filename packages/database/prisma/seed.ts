import { PrismaClient } from '@prisma/client';
import { deterministicHash, encryptField, normalizeEmail } from '@paybrain/shared';

const prisma = new PrismaClient();

async function main() {
  const email = normalizeEmail('alpha-educ@paybrain.cg');
  const merchant = await prisma.merchant.upsert({
    where: { emailHash: deterministicHash(email) },
    update: {},
    create: {
      name: 'Alpha-Educ',
      emailEncrypted: encryptField(email),
      emailHash: deterministicHash(email),
      apiKey: 'paybrain-key-alpha-educ-2026',
      isActive: true,
    },
  });

  console.log('Merchant seed:', merchant.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
