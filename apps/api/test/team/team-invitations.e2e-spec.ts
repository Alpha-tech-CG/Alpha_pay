import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { prisma } from '@paybrain/database';
import { createTestApp } from '../utils/app';
import { bearer, cleanupAppUsers, cleanupMerchant, seedAppUser, seedMembership, seedMerchant } from '../utils/seed';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { createClerkClient } from '@clerk/backend';

jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(async (token: string) => ({ sub: token })),
  createClerkClient: jest.fn(),
}));

interface CapturedNotification {
  channel: string;
  to: string;
  template: string;
  data: Record<string, unknown>;
}

describe('Team Invitations — HTTP e2e', () => {
  let app: INestApplication;
  let merchantId: string;
  let owner: Awaited<ReturnType<typeof seedAppUser>>;
  let manager: Awaited<ReturnType<typeof seedAppUser>>;
  let appUserIds: string[];
  let sentNotifications: CapturedNotification[];

  beforeAll(async () => {
    sentNotifications = [];
    const fakeNotifications = {
      send: jest.fn((params: CapturedNotification) => {
        sentNotifications.push(params);
        return Promise.resolve({ ok: true });
      }),
    };
    app = await createTestApp((builder) => builder.overrideProvider(NotificationService).useValue(fakeNotifications));

    const merchant = await seedMerchant();
    merchantId = merchant.id;
    owner = await seedAppUser();
    manager = await seedAppUser();
    appUserIds = [owner.id, manager.id];
    await seedMembership(merchantId, owner.id, 'OWNER');
    await seedMembership(merchantId, manager.id, 'MANAGER');
  });

  afterAll(async () => {
    await cleanupMerchant(merchantId);
    await cleanupAppUsers(appUserIds);
    await prisma.$disconnect();
    await app.close();
  });

  function tokenFromLink(link: string): string {
    const match = /[?&]token=([^&]+)/.exec(link);
    if (!match) throw new Error(`pas de token dans le lien capturé : ${link}`);
    return match[1];
  }

  it('MANAGER invite un MEMBER : 201, jamais le token en clair dans la réponse, email envoyé', async () => {
    const email = `invitee-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(manager.clerkUserId))
      .send({ email, role: 'MEMBER' })
      .expect(201);

    expect(res.body).toEqual(expect.objectContaining({ email, role: 'MEMBER' }));
    expect(res.body.id).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/[?&]token=/);

    const sent = sentNotifications.find((n) => n.to === email);
    expect(sent).toBeDefined();
    expect(sent!.template).toBe('team.invitation');
    expect(sent!.channel).toBe('EMAIL');
    expect(typeof (sent!.data as { link: string }).link).toBe('string');
  });

  it('MANAGER ne peut pas inviter un ADMIN (team:invite_admin requis)', async () => {
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(manager.clerkUserId))
      .send({ email: `blocked-${Date.now()}@example.com`, role: 'ADMIN' })
      .expect(403);
  });

  it('OWNER peut inviter un ADMIN', async () => {
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ email: `future-admin-${Date.now()}@example.com`, role: 'ADMIN' })
      .expect(201);
  });

  it('une seconde invitation en attente pour le même (marchand, email) est refusée (index partiel DB)', async () => {
    const email = `duplicate-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ email, role: 'MEMBER' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ email, role: 'MANAGER' })
      .expect(409);
  });

  it('aperçu public (sans authentification) : email masqué, aucun token exposé', async () => {
    const email = `preview-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ email, role: 'MEMBER' })
      .expect(201);
    const link = (sentNotifications.find((n) => n.to === email)!.data as { link: string }).link;
    const token = tokenFromLink(link);

    const res = await request(app.getHttpServer()).get(`/v1/invitations/${token}`).expect(200);
    expect(res.body.merchantName).toBeDefined();
    expect(res.body.email).toMatch(/\*/);
    expect(JSON.stringify(res.body)).not.toContain(token);
  });

  it('accept crée un membership ACTIVE — y compris pour un tout nouvel utilisateur Clerk (repli API Clerk)', async () => {
    const email = `brand-new-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ email, role: 'MANAGER' })
      .expect(201);
    const link = (sentNotifications.find((n) => n.to === email)!.data as { link: string }).link;
    const token = tokenFromLink(link);

    // Ce clerkUserId n'a JAMAIS d'app_users pré-existant : force le repli de
    // ClerkSessionGuard (appel API Clerk pour récupérer l'email, puis upsert).
    const newClerkUserId = `clerk_brandnew_${Date.now()}`;
    (createClerkClient as jest.Mock).mockReturnValue({
      users: {
        getUser: jest.fn().mockResolvedValue({
          emailAddresses: [{ id: 'ea1', emailAddress: email }],
          primaryEmailAddressId: 'ea1',
          firstName: 'Nouveau',
          lastName: 'Membre',
        }),
      },
    });

    const acceptRes = await request(app.getHttpServer())
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(newClerkUserId))
      .send({ token })
      .expect(201);

    expect(acceptRes.body.role).toBe('MANAGER');
    expect(acceptRes.body.status).toBe('ACTIVE');

    const createdAppUser = await prisma.appUser.findUnique({ where: { clerkUserId: newClerkUserId } });
    expect(createdAppUser).not.toBeNull();
    appUserIds.push(createdAppUser!.id);

    // Accès effectif : le nouveau membre voit désormais l'équipe.
    await request(app.getHttpServer())
      .get(`/v1/merchants/${merchantId}/members`)
      .set('Authorization', bearer(newClerkUserId))
      .expect(200);
  });

  it("accept rejette si l'email du compte ne correspond pas à celui invité", async () => {
    const email = `mismatch-${Date.now()}@example.com`;
    await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ email, role: 'MEMBER' })
      .expect(201);
    const link = (sentNotifications.find((n) => n.to === email)!.data as { link: string }).link;
    const token = tokenFromLink(link);

    const wrongUser = await seedAppUser(`autre-${Date.now()}@example.com`);
    appUserIds.push(wrongUser.id);

    await request(app.getHttpServer())
      .post('/v1/invitations/accept')
      .set('Authorization', bearer(wrongUser.clerkUserId))
      .send({ token })
      .expect(403);
  });

  it('revoke une invitation pending', async () => {
    const email = `to-revoke-${Date.now()}@example.com`;
    const createRes = await request(app.getHttpServer())
      .post(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .send({ email, role: 'MEMBER' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/v1/merchants/${merchantId}/members/invitations/${createRes.body.id}`)
      .set('Authorization', bearer(owner.clerkUserId))
      .expect(200);

    const invitation = await prisma.merchantInvitation.findUniqueOrThrow({ where: { id: createRes.body.id } });
    expect(invitation.revokedAt).not.toBeNull();
  });

  it('list() renvoie les invitations du marchand avec statut dérivé', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/merchants/${merchantId}/members/invitations`)
      .set('Authorization', bearer(owner.clerkUserId))
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), role: expect.any(String), status: expect.any(String) }),
    );
  });
});
