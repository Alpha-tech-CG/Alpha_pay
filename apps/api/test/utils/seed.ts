import { randomUUID } from 'crypto';
import { prisma } from '@paybrain/database';
import { deterministicHash, encryptField, normalizeEmail } from '../../src/common/security/pii-crypto';
import { generateApiKey, hashApiKeySecret } from '../../src/common/security/api-key';
import { MemberRole } from '../../src/modules/team/permissions/permissions';

type B = Uint8Array<ArrayBuffer>;

export async function seedMerchant(name = 'Boutique e2e') {
  const email = normalizeEmail(`merchant-${randomUUID()}@example.com`);
  return prisma.merchant.create({
    data: {
      name,
      emailEncrypted: encryptField(email) as unknown as B,
      emailHash: deterministicHash(email) as unknown as B,
      merchantType: 'MERCHANT',
      onboardingStatus: 'APPROVED',
      isActive: true,
    },
  });
}

export async function seedAppUser(email?: string, fullName = 'Utilisateur e2e') {
  const norm = normalizeEmail(email ?? `user-${randomUUID()}@example.com`);
  const clerkUserId = `clerk_${randomUUID()}`;
  const user = await prisma.appUser.create({
    data: {
      clerkUserId,
      emailEncrypted: encryptField(norm) as unknown as B,
      emailHash: deterministicHash(norm) as unknown as B,
      fullName,
    },
  });
  return { ...user, clerkUserId, email: norm };
}

export async function seedMembership(
  merchantId: string,
  userId: string,
  role: MemberRole,
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'REMOVED' = 'ACTIVE',
) {
  return prisma.merchantMember.create({
    data: { merchantId, userId, role, status, joinedAt: status === 'ACTIVE' ? new Date() : null },
  });
}

/** Génère et persiste une vraie clé API (même chemin que ApiKeysService en prod). */
export async function seedApiKey(merchantId: string) {
  const generated = generateApiKey('test');
  const hashedSecret = await hashApiKeySecret(generated.secret);
  await prisma.apiKey.create({
    data: { merchantId, name: 'e2e', prefix: generated.prefix, hashedSecret },
  });
  return generated.full;
}

/**
 * Supprime le marchand — `merchant_members`/`merchant_invitations`/
 * `merchant_member_events` sont en cascade (schema.prisma), mais `api_keys`
 * n'a PAS de cascade (FK simple) : à supprimer explicitement d'abord.
 */
export async function cleanupMerchant(merchantId: string) {
  await prisma.apiKey.deleteMany({ where: { merchantId } }).catch(() => undefined);
  await prisma.merchant.delete({ where: { id: merchantId } }).catch(() => undefined);
}

export async function cleanupAppUsers(ids: string[]) {
  if (ids.length === 0) return;
  await prisma.appUser.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
}

export function bearer(clerkUserId: string) {
  return `Bearer ${clerkUserId}`;
}
