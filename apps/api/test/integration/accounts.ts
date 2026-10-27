import request from 'supertest';
import { prisma } from '@paybrain/database';
import { TestApp } from './app';

export const PASSWORD = 'MotDePasse2026';
let seq = 0;

/** Identité unique par test (numéros +24206…, emails distincts). */
export function identity(label = 'user') {
  seq++;
  const n = String(1000000 + seq).slice(-7);
  return { name: `Boutique ${label} ${seq}`, phone: `+24206${n}`, email: `${label}${seq}@boutique.cg`, password: PASSWORD };
}

/** Comptes de test : propriétaire inscrit, membres invités avec un rôle. */
export function accounts(t: TestApp) {
  const http = () => request(t.app.getHttpServer());

  async function signUp(label = 'proprietaire') {
    const id = identity(label);
    const reg = await http().post('/v1/auth/register').send({ ...id, channel: 'sms' });
    if (reg.status !== 201) throw new Error(`inscription : ${reg.status} ${JSON.stringify(reg.body)}`);
    const res = await http().post('/v1/auth/verify').send({ challenge: reg.body.challenge, code: await t.lastCode(id.phone) }).expect(200);
    return { ...id, auth: `Bearer ${res.body.access_token}`, userId: res.body.user.id as string, merchantId: res.body.user.merchants[0].id as string };
  }

  async function inviteAndJoin(owner: { auth: string; merchantId: string }, role: string, label: string) {
    const person = identity(label);
    await http().post(`/v1/merchants/${owner.merchantId}/members/invitations`).set('Authorization', owner.auth).send({ phone: person.phone, role }).expect(201);
    await t.queue.drain('messages');
    const invite = [...t.providers.outbox.sent].reverse().find((m) => m.to === person.phone)!;
    const token = /token=([A-Za-z0-9_-]+)/.exec(invite.variables?.join(' ') ?? invite.content)![1];
    const reg = await http().post('/v1/auth/register').send(person).expect(201);
    const verified = await http().post('/v1/auth/verify').send({ challenge: reg.body.challenge, code: await t.lastCode(person.phone) }).expect(200);
    const auth = `Bearer ${verified.body.access_token}`;
    await http().post('/v1/invitations/accept').set('Authorization', auth).send({ token }).expect(201);
    const member = await prisma.merchantMember.findFirstOrThrow({ where: { merchantId: owner.merchantId, userId: verified.body.user.id } });
    return { ...person, auth, userId: verified.body.user.id as string, memberId: member.id, merchantId: owner.merchantId };
  }

  return { http, signUp, inviteAndJoin };
}
