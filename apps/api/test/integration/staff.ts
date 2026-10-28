import request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { prisma, StaffRole } from '@paybrain/database';
import { base32Decode, hotp, totpStep } from '../../src/common/security/totp';
import { TestApp } from './app';

let seq = 0;

/**
 * Agent AlphaPay de test : compte créé en base, puis vraie connexion
 * (mot de passe, enrôlement TOTP avec un code calculé comme le ferait le téléphone).
 */
export async function staffSession(t: TestApp, role: StaffRole) {
  seq++;
  const email = `${role.toLowerCase()}${seq}@alphapay.cg`;
  const password = 'mot-de-passe-agent-2026';
  const staff = await prisma.staffUser.create({ data: { email, displayName: `Agent ${role}`, role, passwordHash: await bcrypt.hash(password, 4) } });
  const http = () => request(t.app.getHttpServer());
  const step1 = await http().post('/internal/staff/login').send({ email, password }).expect(200);
  const code = hotp(base32Decode(step1.body.secret), totpStep());
  const session = await http().post('/internal/staff/login/enroll').send({ token: step1.body.enroll_token, code }).expect(200);
  return { id: staff.id, email, password, secret: step1.body.secret as string, headers: { Authorization: `Bearer ${session.body.token}` } };
}
