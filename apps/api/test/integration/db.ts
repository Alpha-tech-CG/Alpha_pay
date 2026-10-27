import { prisma, withLivemodeGuard } from '@paybrain/database';

/** Client de test muni du même garde livemode que l'application. */
export const db = withLivemodeGuard(prisma) as unknown as typeof prisma;

/**
 * Vide les tables applicatives entre deux tests. Le registre de crédits est en
 * ajout seul (trigger) : TRUNCATE ne déclenche pas les triggers de ligne, ce
 * qui reste réservé aux tests.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations')`;
  if (tables.length === 0) return;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/** Crée un marchand minimal (identifiants chiffrés factices). */
export async function createMerchant(name = 'Boutique Test') {
  const unique = Buffer.from(`${name}-${Date.now()}-${Math.random()}`);
  return prisma.merchant.create({
    data: { name, emailEncrypted: new Uint8Array(unique), emailHash: new Uint8Array(unique), isActive: true },
  });
}
