import request from 'supertest';
import { prisma } from '@paybrain/database';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

const PASSWORD = 'MotDePasse2026';
let seq = 0;

/** Identité unique par test (numéros +24206…, emails distincts). */
function identity(label = 'user') {
  seq++;
  const n = String(1000000 + seq).slice(-7);
  return { name: `Boutique ${label} ${seq}`, phone: `+24206${n}`, email: `${label}${seq}@boutique.cg`, password: PASSWORD };
}

function cookieFrom(res: request.Response): string {
  const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const c = set.find((v) => v.startsWith('ap_refresh='));
  if (!c) throw new Error('cookie de session absent');
  return c.split(';')[0];
}

describe('M1 Comptes et équipe (HTTP, Postgres réel)', () => {
  let t: TestApp;
  const http = () => request(t.app.getHttpServer());

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase();
    await t.syncTemplates();
    t.providers.outbox.clear();
  });
  afterAll(async () => {
    await t.app.close();
    await prisma.$disconnect();
  });

  /** Inscription complète (code compris) ; renvoie jeton d'accès, cookie et identifiants. */
  async function signUp(label = 'proprietaire', channel: 'sms' | 'email' = 'sms') {
    const id = identity(label);
    const reg = await http().post('/v1/auth/register').send({ ...id, channel });
    if (reg.status !== 201) throw new Error(`inscription : ${reg.status} ${JSON.stringify(reg.body)}`);
    const code = await t.lastCode(channel === 'email' ? id.email : id.phone);
    const res = await http().post('/v1/auth/verify').send({ challenge: reg.body.challenge, code }).expect(200);
    return { ...id, token: res.body.access_token as string, cookie: cookieFrom(res), user: res.body.user };
  }

  async function login(identifier: string, password = PASSWORD, channel: 'sms' | 'email' = 'sms') {
    const step1 = await http().post('/v1/auth/login').send({ identifier, password, channel }).expect(200);
    return step1.body as { challenge: string; to: string };
  }

  describe('inscription et connexion', () => {
    it('inscrit un marchand : compte, marchand et rôle propriétaire, mode live verrouillé', async () => {
      const owner = await signUp();
      expect(owner.user).toMatchObject({ email: owner.email, phoneVerified: true, merchants: [{ role: 'OWNER', kybStatus: 'PENDING' }] });

      const row = await prisma.appUser.findFirstOrThrow({ where: { id: owner.user.id } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(row)).not.toContain(owner.phone.slice(-7));

      const me = await http().get('/v1/auth/me').set('Authorization', `Bearer ${owner.token}`).expect(200);
      expect(me.body.merchants[0].name).toBe(owner.name);
    });

    it('refuse un doublon, un mot de passe faible, un numéro invalide', async () => {
      const owner = await signUp();
      await http().post('/v1/auth/register').send({ ...identity(), email: owner.email }).expect(409);
      const weak = await http().post('/v1/auth/register').send({ ...identity(), password: 'court' }).expect(400);
      expect(weak.body.error.code).toBe('mot_de_passe_trop_faible');
      const bad = await http().post('/v1/auth/register').send({ ...identity(), phone: '12' }).expect(400);
      expect(bad.body.error).toMatchObject({ code: 'telephone_invalide', param: 'phone' });
    });

    it('connexion en deux étapes : mot de passe puis code (canal au choix)', async () => {
      const owner = await signUp();
      const step1 = await login(owner.email, PASSWORD, 'email');
      expect(step1.to).toMatch(/\*\*\*@boutique\.cg$/);
      const code = await t.lastCode(owner.email);
      const res = await http().post('/v1/auth/verify').send({ challenge: step1.challenge, code }).expect(200);
      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
      expect(res.body).not.toHaveProperty('refresh_token'); // jamais lisible par le JavaScript
      expect(cookieFrom(res)).toMatch(/^ap_refresh=/);
      expect(([] as string[]).concat(res.headers['set-cookie'])[0]).toMatch(/HttpOnly.*SameSite=Strict|SameSite=Strict.*HttpOnly/i);
    });

    it('mauvais mot de passe : 401 générique, puis blocage après 10 échecs', async () => {
      const owner = await signUp();
      const unknown = await http().post('/v1/auth/login').send({ identifier: 'inconnu@x.cg', password: PASSWORD }).expect(401);
      const wrong = await http().post('/v1/auth/login').send({ identifier: owner.email, password: 'Mauvais12345' }).expect(401);
      expect(unknown.body.error.code).toBe('identifiants_invalides');
      expect(wrong.body.error.code).toBe('identifiants_invalides'); // même réponse : pas d'énumération
      for (let i = 0; i < 9; i++) await http().post('/v1/auth/login').send({ identifier: owner.email, password: 'Mauvais12345' });
      const locked = await http().post('/v1/auth/login').send({ identifier: owner.email, password: PASSWORD }).expect(429);
      expect(locked.body.error.code).toBe('trop_de_tentatives');
    });

    it('après 5 codes faux, le code est bloqué 15 minutes (acceptation M1)', async () => {
      const owner = await signUp();
      const step1 = await login(owner.phone);
      const code = await t.lastCode(owner.phone);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 4; i++) await http().post('/v1/auth/verify').send({ challenge: step1.challenge, code: wrong }).expect(400);
      const blocked = await http().post('/v1/auth/verify').send({ challenge: step1.challenge, code: wrong }).expect(429);
      expect(blocked.body.error.code).toBe('otp_bloque');
      await http().post('/v1/auth/verify').send({ challenge: step1.challenge, code }).expect(429);
      expect(await prisma.auditLog.count({ where: { action: 'auth.otp_locked' } })).toBe(1);
    });
  });

  describe('sessions', () => {
    it('rafraîchit avec le cookie + en-tête anti-CSRF ; rejouer un ancien jeton révoque la session', async () => {
      const owner = await signUp();
      await http().post('/v1/auth/refresh').set('Cookie', owner.cookie).expect(403); // sans en-tête CSRF

      const r1 = await http().post('/v1/auth/refresh').set('Cookie', owner.cookie).set('X-AlphaPay-CSRF', '1').expect(200);
      const cookie2 = cookieFrom(r1);
      await http().get('/v1/auth/me').set('Authorization', `Bearer ${r1.body.access_token}`).expect(200);

      // Rejeu du premier jeton (vol présumé) → session révoquée, y compris le nouveau jeton d'accès.
      await http().post('/v1/auth/refresh').set('Cookie', owner.cookie).set('X-AlphaPay-CSRF', '1').expect(401);
      await http().post('/v1/auth/refresh').set('Cookie', cookie2).set('X-AlphaPay-CSRF', '1').expect(401);
      await http().get('/v1/auth/me').set('Authorization', `Bearer ${r1.body.access_token}`).expect(401);
    });

    it('déconnexion : le jeton d’accès est refusé immédiatement', async () => {
      const owner = await signUp();
      await http().post('/v1/auth/logout').set('Authorization', `Bearer ${owner.token}`).expect(200);
      await http().get('/v1/auth/me').set('Authorization', `Bearer ${owner.token}`).expect(401);
    });

    it('déconnexion de toutes les sessions', async () => {
      const owner = await signUp();
      const step = await login(owner.phone);
      const second = await http().post('/v1/auth/verify').send({ challenge: step.challenge, code: await t.lastCode(owner.phone) }).expect(200);

      const list = await http().get('/v1/auth/sessions').set('Authorization', `Bearer ${owner.token}`).expect(200);
      expect(list.body.data).toHaveLength(2);
      const res = await http().post('/v1/auth/logout-all').set('Authorization', `Bearer ${owner.token}`).expect(200);
      expect(res.body.sessions_revoked).toBe(2);
      await http().get('/v1/auth/me').set('Authorization', `Bearer ${second.body.access_token}`).expect(401);
    });

    it('réinitialisation : réponse identique pour un compte inconnu, nouveau mot de passe, sessions fermées', async () => {
      const owner = await signUp();
      const ghost = await http().post('/v1/auth/password/forgot').send({ identifier: 'personne@x.cg', channel: 'email' }).expect(200);
      const real = await http().post('/v1/auth/password/forgot').send({ identifier: owner.email, channel: 'email' }).expect(200);
      expect(Object.keys(ghost.body).sort()).toEqual(Object.keys(real.body).sort());

      const code = await t.lastCode(owner.email);
      await http().post('/v1/auth/password/reset').send({ challenge: real.body.challenge, code, password: 'NouveauSecret2026' }).expect(200);
      await http().get('/v1/auth/me').set('Authorization', `Bearer ${owner.token}`).expect(401);
      await http().post('/v1/auth/login').send({ identifier: owner.email, password: PASSWORD }).expect(401);
      await login(owner.email, 'NouveauSecret2026');
    });
  });

  describe('équipe et rôles (contrôle d’accès côté serveur)', () => {
    async function inviteAndJoin(owner: Awaited<ReturnType<typeof signUp>>, role: string, label: string) {
      const merchantId = owner.user.merchants[0].id;
      const person = identity(label);
      await http()
        .post(`/v1/merchants/${merchantId}/members/invitations`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ phone: person.phone, role })
        .expect(201);
      await t.queue.drain('messages');
      const invite = [...t.providers.outbox.sent].reverse().find((m) => m.to === person.phone)!;
      const token = /token=([A-Za-z0-9_-]+)/.exec(invite.variables?.join(' ') ?? invite.content)![1];

      // L'invité crée son compte (avec ce numéro, vérifié) puis accepte.
      const reg = await http().post('/v1/auth/register').send(person).expect(201);
      const verified = await http().post('/v1/auth/verify').send({ challenge: reg.body.challenge, code: await t.lastCode(person.phone) }).expect(200);
      const auth = `Bearer ${verified.body.access_token}`;
      await http().post('/v1/invitations/accept').set('Authorization', auth).send({ token }).expect(201);
      const members = await prisma.merchantMember.findMany({ where: { merchantId, userId: verified.body.user.id } });
      return { ...person, auth, userId: verified.body.user.id as string, memberId: members[0].id, merchantId };
    }

    it('invitation par téléphone, puis un membre retiré perd l’accès immédiatement, sessions comprises (acceptation M1)', async () => {
      const owner = await signUp();
      const cashier = await inviteAndJoin(owner, 'CASHIER', 'caissier');
      const merchantId = cashier.merchantId;

      // Un caissier ne gère pas l'équipe.
      await http().get(`/v1/merchants/${merchantId}/members`).set('Authorization', cashier.auth).expect(403);
      await http().get('/v1/auth/me').set('Authorization', cashier.auth).expect(200);

      await http().delete(`/v1/merchants/${merchantId}/members/${cashier.memberId}`).set('Authorization', `Bearer ${owner.token}`).expect(200);
      await http().get('/v1/auth/me').set('Authorization', cashier.auth).expect(401); // session révoquée
      expect(await prisma.auditLog.count({ where: { action: 'team.member_removed', targetId: cashier.memberId } })).toBe(1);
    });

    it('anti-escalade : un administrateur ne touche ni au propriétaire ni à un autre administrateur', async () => {
      const owner = await signUp();
      const admin = await inviteAndJoin(owner, 'ADMIN', 'admin');
      const ownerMember = await prisma.merchantMember.findFirstOrThrow({ where: { merchantId: admin.merchantId, role: 'OWNER' } });

      await http().delete(`/v1/merchants/${admin.merchantId}/members/${ownerMember.id}`).set('Authorization', admin.auth).expect(403);
      await http()
        .post(`/v1/merchants/${admin.merchantId}/members/invitations`)
        .set('Authorization', admin.auth)
        .send({ email: 'autre-admin@boutique.cg', role: 'ADMIN' })
        .expect(403);
      await http()
        .post(`/v1/merchants/${admin.merchantId}/members/invitations`)
        .set('Authorization', admin.auth)
        .send({ email: 'dev@boutique.cg', role: 'DEVELOPER' })
        .expect(201);
    });

    it('un utilisateur ne voit jamais un marchand dont il n’est pas membre', async () => {
      const a = await signUp('a');
      const b = await signUp('b');
      await http().get(`/v1/merchants/${a.user.merchants[0].id}/members`).set('Authorization', `Bearer ${b.token}`).expect(403);
      await http().get(`/v1/merchants/${a.user.merchants[0].id}/members`).expect(401);
    });

    it('une invitation par téléphone ne peut pas être acceptée par un autre compte', async () => {
      const owner = await signUp();
      const merchantId = owner.user.merchants[0].id;
      await http()
        .post(`/v1/merchants/${merchantId}/members/invitations`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ phone: '+242069999990', role: 'ACCOUNTANT' })
        .expect(201);
      await t.queue.drain('messages');
      const invite = [...t.providers.outbox.sent].reverse().find((m) => m.to === '+242069999990')!;
      const token = /token=([A-Za-z0-9_-]+)/.exec(invite.variables?.join(' ') ?? invite.content)![1];
      const intruder = await signUp('intrus');
      await http().post('/v1/invitations/accept').set('Authorization', `Bearer ${intruder.token}`).send({ token }).expect(403);
    });
  });
});
