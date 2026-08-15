import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { prisma } from '@paybrain/database';
import { createTestApp } from '../utils/app';
import {
  bearer,
  cleanupAppUsers,
  cleanupMerchant,
  seedApiKey,
  seedAppUser,
  seedMembership,
  seedMerchant,
} from '../utils/seed';

// Le vrai réseau Clerk n'est pas sollicité : seule la vérification du token
// (`verifyToken`) est stubée — tout le reste (guards, services, DB Postgres
// réelle) tourne en vrai. Le token présenté DEVIENT le clerkUserId, ce qui
// permet de piloter précisément l'identité de chaque requête depuis les tests.
jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(async (token: string) => ({ sub: token })),
  createClerkClient: jest.fn(),
}));

describe('Team Members — HTTP e2e', () => {
  let app: INestApplication;
  let merchantId: string;
  let owner: Awaited<ReturnType<typeof seedAppUser>>;
  let admin: Awaited<ReturnType<typeof seedAppUser>>;
  let manager: Awaited<ReturnType<typeof seedAppUser>>;
  let member: Awaited<ReturnType<typeof seedAppUser>>;
  let outsider: Awaited<ReturnType<typeof seedAppUser>>;
  let memberMembershipId: string;
  let appUserIds: string[];

  beforeAll(async () => {
    app = await createTestApp();

    const merchant = await seedMerchant();
    merchantId = merchant.id;

    owner = await seedAppUser();
    admin = await seedAppUser();
    manager = await seedAppUser();
    member = await seedAppUser();
    outsider = await seedAppUser();
    appUserIds = [owner.id, admin.id, manager.id, member.id, outsider.id];

    await seedMembership(merchantId, owner.id, 'OWNER');
    await seedMembership(merchantId, admin.id, 'ADMIN');
    await seedMembership(merchantId, manager.id, 'MANAGER');
    const memberMembership = await seedMembership(merchantId, member.id, 'MEMBER');
    memberMembershipId = memberMembership.id;
  });

  afterAll(async () => {
    await cleanupMerchant(merchantId);
    await cleanupAppUsers(appUserIds);
    await prisma.$disconnect();
    await app.close();
  });

  describe('Authentification & isolation multi-tenant', () => {
    it('401 sans Authorization', async () => {
      await request(app.getHttpServer()).get(`/v1/merchants/${merchantId}/members`).expect(401);
    });

    it('403 pour un utilisateur Clerk authentifié sans membership sur ce marchand', async () => {
      await request(app.getHttpServer())
        .get(`/v1/merchants/${merchantId}/members`)
        .set('Authorization', bearer(outsider.clerkUserId))
        .expect(403);
    });

    it('le merchantId du body/query est ignoré — seul celui du path fait foi', async () => {
      const otherMerchant = await seedMerchant('Autre boutique');
      await request(app.getHttpServer())
        .get(`/v1/merchants/${otherMerchant.id}/members`)
        .set('Authorization', bearer(owner.clerkUserId))
        .query({ merchantId }) // owner n'est PAS membre de otherMerchant : ce paramètre ne doit rien changer
        .expect(403);
      await cleanupMerchant(otherMerchant.id);
    });
  });

  describe('Liste des membres', () => {
    it('200 pour un membre ACTIVE (VIEWER minimum), retourne les 4 membres', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/merchants/${merchantId}/members`)
        .set('Authorization', bearer(member.clerkUserId))
        .expect(200);
      expect(res.body).toHaveLength(4);
      expect(res.body.map((m: { role: string }) => m.role).sort()).toEqual(['ADMIN', 'MANAGER', 'MEMBER', 'OWNER']);
    });

    it("masque l'email pour un viewer MEMBER, le montre en clair pour un viewer ADMIN (durcissement étape F)", async () => {
      const asMember = await request(app.getHttpServer())
        .get(`/v1/merchants/${merchantId}/members`)
        .set('Authorization', bearer(member.clerkUserId))
        .expect(200);
      const asAdmin = await request(app.getHttpServer())
        .get(`/v1/merchants/${merchantId}/members`)
        .set('Authorization', bearer(admin.clerkUserId))
        .expect(200);

      const ownerAsSeenByMember = asMember.body.find((m: { userId: string }) => m.userId === owner.id);
      const ownerAsSeenByAdmin = asAdmin.body.find((m: { userId: string }) => m.userId === owner.id);

      expect(ownerAsSeenByMember.email).toMatch(/\*/);
      expect(ownerAsSeenByMember.email).not.toBe(owner.email);
      expect(ownerAsSeenByAdmin.email).toBe(owner.email);
    });
  });

  describe('changeRole', () => {
    it('ADMIN peut promouvoir un MEMBER en MANAGER (et ça journalise ROLE_CHANGED)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/v1/merchants/${merchantId}/members/${memberMembershipId}`)
        .set('Authorization', bearer(admin.clerkUserId))
        .send({ role: 'MANAGER' })
        .expect(200);
      expect(res.body.role).toBe('MANAGER');

      const events = await prisma.merchantMemberEvent.findMany({ where: { merchantId, eventType: 'ROLE_CHANGED' } });
      expect(events.length).toBeGreaterThan(0);

      // remet MEMBER pour ne pas perturber les tests suivants.
      await request(app.getHttpServer())
        .patch(`/v1/merchants/${merchantId}/members/${memberMembershipId}`)
        .set('Authorization', bearer(admin.clerkUserId))
        .send({ role: 'MEMBER' })
        .expect(200);
    });

    it('rejette un rôle OWNER (400, validation DTO — réservé au transfert de propriété)', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/merchants/${merchantId}/members/${memberMembershipId}`)
        .set('Authorization', bearer(admin.clerkUserId))
        .send({ role: 'OWNER' })
        .expect(400);
    });

    it('anti-escalade : MANAGER ne peut pas changer de rôle (403, RequireActionGuard)', async () => {
      await request(app.getHttpServer())
        .patch(`/v1/merchants/${merchantId}/members/${memberMembershipId}`)
        .set('Authorization', bearer(manager.clerkUserId))
        .send({ role: 'VIEWER' })
        .expect(403);
    });
  });

  describe('suspend / reactivate / remove', () => {
    it('OWNER ne peut pas se suspendre lui-même (anti-escalade : aucun rang ne dépasse OWNER)', async () => {
      const ownerMembership = await prisma.merchantMember.findFirstOrThrow({ where: { merchantId, userId: owner.id } });
      await request(app.getHttpServer())
        .post(`/v1/merchants/${merchantId}/members/${ownerMembership.id}/suspend`)
        .set('Authorization', bearer(owner.clerkUserId))
        .expect(403);
    });

    it('ADMIN suspend puis réactive un MEMBER', async () => {
      await request(app.getHttpServer())
        .post(`/v1/merchants/${merchantId}/members/${memberMembershipId}/suspend`)
        .set('Authorization', bearer(admin.clerkUserId))
        .expect(201);

      const suspended = await prisma.merchantMember.findUniqueOrThrow({ where: { id: memberMembershipId } });
      expect(suspended.status).toBe('SUSPENDED');

      await request(app.getHttpServer())
        .post(`/v1/merchants/${merchantId}/members/${memberMembershipId}/reactivate`)
        .set('Authorization', bearer(admin.clerkUserId))
        .expect(201);

      const reactivated = await prisma.merchantMember.findUniqueOrThrow({ where: { id: memberMembershipId } });
      expect(reactivated.status).toBe('ACTIVE');
    });

    it('anti-escalade entre pairs : ADMIN ne peut pas suspendre un autre ADMIN', async () => {
      const secondAdmin = await seedAppUser();
      appUserIds.push(secondAdmin.id);
      const secondAdminMembership = await seedMembership(merchantId, secondAdmin.id, 'ADMIN');

      await request(app.getHttpServer())
        .post(`/v1/merchants/${merchantId}/members/${secondAdminMembership.id}/suspend`)
        .set('Authorization', bearer(admin.clerkUserId))
        .expect(403);
    });

    it('ADMIN retire (soft-delete) un MEMBER', async () => {
      const toRemove = await seedAppUser();
      appUserIds.push(toRemove.id);
      const membership = await seedMembership(merchantId, toRemove.id, 'MEMBER');

      await request(app.getHttpServer())
        .delete(`/v1/merchants/${merchantId}/members/${membership.id}`)
        .set('Authorization', bearer(admin.clerkUserId))
        .expect(200);

      const removed = await prisma.merchantMember.findUniqueOrThrow({ where: { id: membership.id } });
      expect(removed.status).toBe('REMOVED');
      expect(removed.removedAt).not.toBeNull();
    });
  });

  describe('Audit', () => {
    it("ADMIN consulte le journal d'événements, MEMBER n'a pas team:audit", async () => {
      await request(app.getHttpServer())
        .get(`/v1/merchants/${merchantId}/members/events`)
        .set('Authorization', bearer(admin.clerkUserId))
        .expect(200);

      await request(app.getHttpServer())
        .get(`/v1/merchants/${merchantId}/members/events`)
        .set('Authorization', bearer(member.clerkUserId))
        .expect(403);
    });
  });

  describe('Endpoint mobile (lecture seule, ApiKeyGuard — décision 2A)', () => {
    it("une clé API valide voit l'équipe du marchand, sans Clerk", async () => {
      const apiKey = await seedApiKey(merchantId);
      const res = await request(app.getHttpServer()).get('/v1/team/members').set('X-API-Key', apiKey).expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('401 sans clé API', async () => {
      await request(app.getHttpServer()).get('/v1/team/members').expect(401);
    });
  });

  describe('GET /v1/me/merchants (résolution du marchand côté dashboard)', () => {
    it("liste les marchands où l'utilisateur a un membership ACTIVE, sans :merchantId dans le path", async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/me/merchants')
        .set('Authorization', bearer(admin.clerkUserId))
        .expect(200);
      expect(res.body).toEqual(
        expect.arrayContaining([expect.objectContaining({ merchantId, role: 'ADMIN' })]),
      );
    });

    it('renvoie un tableau vide pour un Clerk user sans aucun membership', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/me/merchants')
        .set('Authorization', bearer(outsider.clerkUserId))
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('401 sans Authorization', async () => {
      await request(app.getHttpServer()).get('/v1/me/merchants').expect(401);
    });
  });
});
