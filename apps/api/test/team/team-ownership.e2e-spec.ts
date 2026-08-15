import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { prisma } from '@paybrain/database';
import { createTestApp } from '../utils/app';
import { bearer, cleanupAppUsers, cleanupMerchant, seedAppUser, seedMembership, seedMerchant } from '../utils/seed';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(async (token: string) => ({ sub: token })),
  createClerkClient: jest.fn(),
}));

describe('Ownership transfer — HTTP e2e', () => {
  let app: INestApplication;
  let merchantId: string;
  let owner: Awaited<ReturnType<typeof seedAppUser>>;
  let admin: Awaited<ReturnType<typeof seedAppUser>>;
  let appUserIds: string[];

  beforeAll(async () => {
    app = await createTestApp();
    const merchant = await seedMerchant();
    merchantId = merchant.id;
    owner = await seedAppUser();
    admin = await seedAppUser();
    appUserIds = [owner.id, admin.id];
    await seedMembership(merchantId, owner.id, 'OWNER');
    await seedMembership(merchantId, admin.id, 'ADMIN');
  });

  afterAll(async () => {
    await cleanupMerchant(merchantId);
    await cleanupAppUsers(appUserIds);
    await prisma.$disconnect();
    await app.close();
  });

  it('ADMIN ne peut pas transférer la propriété (403)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/ownership/transfer`)
      .set('Authorization', bearer(admin.clerkUserId))
      .send({ toUserId: admin.id })
      .expect(403);
  });

  it("OWNER transfère : ancien OWNER -> ADMIN, cible -> OWNER, merchants.owner_user_id à jour, un seul OWNER actif", async () => {
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/ownership/transfer`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ toUserId: admin.id })
      .expect(201);

    const [oldOwnerMembership, newOwnerMembership, merchant, activeOwners] = await Promise.all([
      prisma.merchantMember.findFirstOrThrow({ where: { merchantId, userId: owner.id } }),
      prisma.merchantMember.findFirstOrThrow({ where: { merchantId, userId: admin.id } }),
      prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } }),
      prisma.merchantMember.count({ where: { merchantId, role: 'OWNER', status: 'ACTIVE' } }),
    ]);

    expect(oldOwnerMembership.role).toBe('ADMIN');
    expect(newOwnerMembership.role).toBe('OWNER');
    expect(merchant.ownerUserId).toBe(admin.id);
    expect(activeOwners).toBe(1);

    const event = await prisma.merchantMemberEvent.findFirst({
      where: { merchantId, eventType: 'OWNERSHIP_TRANSFERRED' },
    });
    expect(event).not.toBeNull();
  });

  it("l'ancien OWNER (désormais ADMIN) ne peut plus transférer la propriété", async () => {
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/ownership/transfer`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ toUserId: owner.id })
      .expect(403);
  });

  it('le nouveau OWNER peut transférer à son tour', async () => {
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/ownership/transfer`)
      .set('Authorization', bearer(admin.clerkUserId))
      .send({ toUserId: owner.id })
      .expect(201);

    const merchant = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
    expect(merchant.ownerUserId).toBe(owner.id);
  });
});
