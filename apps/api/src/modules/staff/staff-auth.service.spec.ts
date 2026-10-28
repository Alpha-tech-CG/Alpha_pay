import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { MemoryKvStore } from '../../common/kv/kv-store';
import { base32Decode, hotp, totpStep } from '../../common/security/totp';
import { decryptField } from '../../common/security/pii-crypto';
import { StaffAuthService } from './staff-auth.service';

const sha = (kind: string, token: string) => createHash('sha256').update(`${kind}:${token}`).digest('hex');

describe('StaffAuthService (OTP obligatoire)', () => {
  let prisma: any;
  let sessions: Map<string, any>;
  let user: any;
  let service: StaffAuthService;

  beforeEach(async () => {
    sessions = new Map();
    user = { id: 's1', email: 'agent@alphapay.cg', role: 'SUPPORT', isActive: true, totpEnabled: false, totpSecretEnc: null, passwordHash: await bcrypt.hash('motdepasse-solide', 4) };
    prisma = {
      staffUser: {
        findUnique: jest.fn(async () => user),
        update: jest.fn(async ({ data }: any) => Object.assign(user, data)),
      },
      staffSession: {
        create: jest.fn(async ({ data }: any) => sessions.set(data.tokenHash, { ...data, staff: user })),
        findUnique: jest.fn(async ({ where }: any) => sessions.get(where.tokenHash) ?? null),
        delete: jest.fn(async ({ where }: any) => sessions.delete(where.tokenHash)),
        deleteMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    service = new StaffAuthService(prisma, new MemoryKvStore());
  });

  const codeFor = (secret: string) => hotp(base32Decode(secret), totpStep());

  it('premier accès : enrôlement obligatoire, aucune session sans code ; le secret est chiffré au repos', async () => {
    const step1 = (await service.loginPassword(user.email, 'motdepasse-solide')) as any;
    expect(step1).toMatchObject({ step: 'enroll', otpauth_url: expect.stringMatching(/^otpauth:\/\/totp\//) });
    expect(step1).not.toHaveProperty('token');
    expect(user.totpSecretEnc).not.toContain(step1.secret);
    expect(decryptField(Buffer.from(user.totpSecretEnc, 'base64'))).toBe(step1.secret);

    await expect(service.enroll(step1.enroll_token, '000000')).rejects.toThrow('Code invalide');
    const again = (await service.loginPassword(user.email, 'motdepasse-solide')) as any; // jeton consommé : on recommence
    const session = await service.enroll(again.enroll_token, codeFor(again.secret));
    expect(user.totpEnabled).toBe(true);
    expect(await service.verifyToken(session.response.token)).toEqual({ staffId: 's1', email: user.email, role: 'SUPPORT' });
  });

  it('compte enrôlé : mot de passe puis code ; le même code ne peut pas resservir', async () => {
    const enrolled = (await service.loginPassword(user.email, 'motdepasse-solide')) as any;
    await service.enroll(enrolled.enroll_token, codeFor(enrolled.secret));

    const a = (await service.loginPassword(user.email, 'motdepasse-solide')) as any;
    expect(a.step).toBe('otp');
    const code = codeFor(enrolled.secret);
    await expect(service.loginOtp(a.otp_token, code)).rejects.toThrow('Code invalide'); // déjà utilisé à l'enrôlement
  });

  it('un jeton d’étape OTP ou d’enrôlement ne vaut jamais comme session', async () => {
    const step1 = (await service.loginPassword(user.email, 'motdepasse-solide')) as any;
    await expect(service.verifyToken(step1.enroll_token)).rejects.toThrow('Session expirée');
  });

  it('mauvais mot de passe : refus générique puis blocage après 5 échecs', async () => {
    for (let i = 0; i < 5; i++) await expect(service.loginPassword(user.email, 'faux')).rejects.toThrow('Identifiants invalides');
    await expect(service.loginPassword(user.email, 'motdepasse-solide')).rejects.toMatchObject({ status: 429 });
  });

  it('session expirée ou compte sans OTP actif : refusée', async () => {
    sessions.set(sha('session', 'tok'), { expiresAt: new Date(Date.now() - 1000), staff: { ...user, totpEnabled: true } });
    await expect(service.verifyToken('tok')).rejects.toThrow('Session expirée');
    sessions.set(sha('session', 'tok2'), { expiresAt: new Date(Date.now() + 60_000), staff: { ...user, totpEnabled: false } });
    await expect(service.verifyToken('tok2')).rejects.toThrow('deux facteurs');
  });
});
