import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { email: 'alpha-educ@paybrain.cg' },
    update: {},
    create: {
      name: 'Alpha-Educ',
      email: 'alpha-educ@paybrain.cg',
      apiKey: 'paybrain-key-alpha-educ-2026',
      isActive: true,
    },
  });

  console.log('Merchant seed:', merchant.name, '—', merchant.apiKey);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
