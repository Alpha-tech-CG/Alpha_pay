import { randomUUID } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { ApiKeysService } from '../../src/modules/api-keys/api-keys.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { resetDatabase } from './db';

const STAFF = { 'X-Internal-Token': 'test-internal-token-0123456789abcdef', 'X-Staff-Id': 'conformite@alphapay.cg' };
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n% pièce de test\n'), Buffer.alloc(2000, 0x20), Buffer.from('\n%%EOF')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 1)]);

const COMPANY = {
  legalName: 'Boulangerie La Congolaise SARL',
  legalForm: 'SARL',
  rccm: 'CG-BZV-01-2024-B12-00123',
  niu: 'M2024000012345X',
  address: '12 avenue de la Paix, Brazzaville',
  sector: 'Commerce de détail',
  directorFirstName: 'Jean',
  directorLastName: 'Mabiala',
};

/** Tous les fichiers écrits par le stockage local pendant le test. */
function storedFiles(dir = process.env.STORAGE_DIR!): string[] {
  try {
    return readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? storedFiles(join(dir, f)) : [join(dir, f)]));
  } catch {
    return [];
  }
}

describe('M2 Dossier KYB et KYC (HTTP, Postgres réel)', () => {
  let t: TestApp;
  let a: ReturnType<typeof accounts>;

  beforeAll(async () => {
    t = await createTestApp();
    a = accounts(t);
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

  /** Dossier complet : informations, trois pièces, KYC lancé puis validé par la page factice. */
  async function completeApplication(owner: { auth: string; merchantId: string }, lastName = 'Mabiala') {
    const base = `/v1/merchants/${owner.merchantId}/kyb`;
    await a.http().patch(base).set('Authorization', owner.auth).send({ ...COMPANY, directorLastName: lastName }).expect(200);
    for (const [type, file, name] of [['RCCM_EXTRACT', PDF, 'rccm.pdf'], ['NIU_CERTIFICATE', PDF, 'niu.pdf'], ['DIRECTOR_ID', PNG, 'cni.png']] as const) {
      await a.http().post(`${base}/documents/${type}`).set('Authorization', owner.auth).attach('file', file, name).expect(201);
    }
    const kyc = await a.http().post(`${base}/kyc`).set('Authorization', owner.auth).expect(201);
    const applicantId = new URL(kyc.body.url).pathname.split('/').pop();
    await a.http().post(`/mock/kyc/${applicantId}/submit`).expect(201);
    return base;
  }

  it('parcours complet : brouillon → soumis → en revue → approuvé ; le mode live s’ouvre ; historique et notification', async () => {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}/kyb`;

    const draft = await a.http().get(base).set('Authorization', owner.auth).expect(200);
    expect(draft.body).toMatchObject({ status: 'brouillon', editable: true, live_enabled: false, kyc: null });
    expect(draft.body.missing).toEqual(expect.arrayContaining(['rccm', 'niu', 'RCCM_EXTRACT', 'DIRECTOR_ID']));
    const early = await a.http().post(`${base}/submit`).set('Authorization', owner.auth).expect(422);
    expect(early.body.error.code).toBe('dossier_incomplet');

    await completeApplication(owner);
    const ready = await a.http().get(base).set('Authorization', owner.auth).expect(200);
    expect(ready.body).toMatchObject({ missing: [], kyc: { status: 'approuvé', provider: 'mock-kyc' } });
    expect(ready.body.documents.map((d: any) => d.type)).toEqual(['RCCM_EXTRACT', 'NIU_CERTIFICATE', 'DIRECTOR_ID']);

    await a.http().post(`${base}/submit`).set('Authorization', owner.auth).expect(200);
    await a.http().patch(base).set('Authorization', owner.auth).send({ sector: 'Autre' }).expect(409); // verrouillé une fois soumis

    // Back-office : file, revue, décision.
    const queue = await a.http().get('/internal/kyb').set(STAFF).expect(200);
    expect(queue.body.data).toEqual([expect.objectContaining({ merchant_id: owner.merchantId, status: 'soumis', kyc: 'approuvé' })]);
    const id = queue.body.data[0].id;
    await a.http().post(`/internal/kyb/${id}/review`).set(STAFF).expect(200);
    const approved = await a.http().post(`/internal/kyb/${id}/decision`).set(STAFF).send({ decision: 'approve' }).expect(200);
    expect(approved.body).toMatchObject({ status: 'approuvé', live_enabled: true });
    expect(approved.body.history.map((h: any) => `${h.from ?? '∅'}→${h.to}:${h.actor_type}`)).toEqual([
      'brouillon→soumis:user',
      'soumis→en_revue:staff',
      'en_revue→approuvé:staff',
    ]);
    expect(approved.body.history[2].actor_id).toBe('conformite@alphapay.cg');

    // Seul un dossier approuvé ouvre le live (garde côté API).
    expect((await prisma.merchant.findUniqueOrThrow({ where: { id: owner.merchantId } })).onboardingStatus).toBe('APPROVED');
    const key = await t.app.get(ApiKeysService).create(owner.merchantId, { name: 'prod', mode: 'live' });
    expect(key.key).toMatch(/^ap_live_/);

    await t.queue.drain('messages');
    const notes = t.providers.outbox.sent.filter((m) => m.to === owner.email && m.subject?.startsWith('Votre dossier AlphaPay'));
    expect(notes.map((n) => n.subject)).toEqual(['Votre dossier AlphaPay : soumis', 'Votre dossier AlphaPay : en revue', 'Votre dossier AlphaPay : approuvé']);
    expect(await prisma.auditLog.count({ where: { action: 'kyb.status_changed' } })).toBe(3);
  });

  it('un marchand non approuvé ne peut ni générer de clé live ni encaisser en live (acceptation M2, côté API)', async () => {
    const owner = await a.signUp();
    await completeApplication(owner);
    await a.http().post(`/v1/merchants/${owner.merchantId}/kyb/submit`).set('Authorization', owner.auth).expect(200);

    const live = await a.http().post(`/v1/merchants/${owner.merchantId}/api-keys`).set('Authorization', owner.auth).send({ name: 'prod', mode: 'live' }).expect(403);
    expect(live.body.error.code).toBe('kyb_non_valide');
    // Même une clé live émise auparavant n'encaisse pas tant que le dossier n'est pas approuvé.
    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { onboardingStatus: 'APPROVED' } });
    const { key } = await t.app.get(ApiKeysService).create(owner.merchantId, { name: 'ancienne', mode: 'live' });
    await prisma.merchant.update({ where: { id: owner.merchantId }, data: { onboardingStatus: 'PENDING' } });
    const pay = await a.http().post('/v1/payments').set('Authorization', `Bearer ${key}`).set('Idempotency-Key', randomUUID())
      .send({ amount: 1000, phone: MOCK_MOBILE_MONEY_NUMBERS.success, reference: 'x' }).expect(403);
    expect(pay.body.error.code).toBe('kyb_non_valide');
  });

  it('compléments demandés avec motif → le marchand corrige et resoumet ; refus définitif avec motif', async () => {
    const owner = await a.signUp();
    const base = await completeApplication(owner);
    await a.http().post(`${base}/submit`).set('Authorization', owner.auth).expect(200);
    const id = (await a.http().get(base).set('Authorization', owner.auth)).body.id;

    await a.http().post(`/internal/kyb/${id}/decision`).set(STAFF).send({ decision: 'request_info' }).expect(400); // motif obligatoire
    await a.http().post(`/internal/kyb/${id}/decision`).set(STAFF).send({ decision: 'request_info', reason: 'Extrait RCCM illisible' }).expect(200);
    const info = await a.http().get(base).set('Authorization', owner.auth).expect(200);
    expect(info.body).toMatchObject({ status: 'infos_requises', editable: true, decision_reason: 'Extrait RCCM illisible' });

    await a.http().post(`${base}/documents/RCCM_EXTRACT`).set('Authorization', owner.auth).attach('file', PDF, 'rccm-v2.pdf').expect(201);
    await a.http().post(`${base}/submit`).set('Authorization', owner.auth).expect(200);
    const rejected = await a.http().post(`/internal/kyb/${id}/decision`).set(STAFF).send({ decision: 'reject', reason: 'Activité non éligible' }).expect(200);
    expect(rejected.body.status).toBe('refusé');
    expect(rejected.body.history.map((h: any) => h.to)).toEqual(['soumis', 'en_revue', 'infos_requises', 'soumis', 'en_revue', 'refusé']);
    await a.http().post(`/internal/kyb/${id}/decision`).set(STAFF).send({ decision: 'approve' }).expect(409); // dossier clos
    expect((await prisma.merchant.findUniqueOrThrow({ where: { id: owner.merchantId } })).onboardingStatus).toBe('REJECTED');
  });

  it('KYC refusé : approbation bloquée sauf dérogation motivée', async () => {
    const owner = await a.signUp();
    const base = await completeApplication(owner, 'REJET');
    const view = (await a.http().get(base).set('Authorization', owner.auth)).body;
    expect(view.kyc).toMatchObject({ status: 'refusé', reasons: ['DOCUMENT_INVALID'] });
    await a.http().post(`${base}/submit`).set('Authorization', owner.auth).expect(200);

    const blocked = await a.http().post(`/internal/kyb/${view.id}/decision`).set(STAFF).send({ decision: 'approve' }).expect(422);
    expect(blocked.body.error.code).toBe('kyc_non_approuve');
    await a.http().post(`/internal/kyb/${view.id}/decision`).set(STAFF)
      .send({ decision: 'approve', kyc_override: true, reason: 'Pièce d’identité vérifiée manuellement en agence' }).expect(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'kyb.status_changed', metadata: { path: ['to'], equals: 'approuvé' } } });
    expect(log.metadata).toMatchObject({ kycOverride: true });
  });

  it('pièces : format vérifié, stockage chiffré, lecture par URL signée et temporaire seulement, consultation auditée', async () => {
    const owner = await a.signUp();
    const base = `/v1/merchants/${owner.merchantId}/kyb`;
    const fake = await a.http().post(`${base}/documents/RCCM_EXTRACT`).set('Authorization', owner.auth).attach('file', Buffer.from('MZ exécutable déguisé'), 'rccm.pdf').expect(415);
    expect(fake.body.error.code).toBe('format_non_supporte');

    const before = new Set(storedFiles());
    const up = await a.http().post(`${base}/documents/RCCM_EXTRACT`).set('Authorization', owner.auth).attach('file', PDF, 'rccm.pdf').expect(201);
    const written = storedFiles().filter((f) => !before.has(f));
    expect(written).toHaveLength(1);
    const onDisk = readFileSync(written[0]);
    expect(onDisk.includes(Buffer.from('%PDF'))).toBe(false); // chiffré au repos
    expect(onDisk.includes(Buffer.from('pièce de test'))).toBe(false);

    const docId = up.body.documents[0].id;
    const signed = await a.http().get(`${base}/documents/${docId}/url`).set('Authorization', owner.auth).expect(200);
    const path = new URL(signed.body.url).pathname + new URL(signed.body.url).search;
    const file = await a.http().get(path).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(file.body as Buffer, PDF)).toBe(0);

    await a.http().get(path.replace(/sig=[^&]+/, 'sig=faux')).expect(403);
    await a.http().get(`/v1/files/${docId}`).expect(403);
    const expired = path.replace(/expires=\d+/, `expires=${Math.floor(Date.now() / 1000) - 10}`);
    await a.http().get(expired).expect(403);

    // Le back-office voit la pièce ; chaque consultation est auditée avec l'agent.
    const app = await prisma.kybApplication.findUniqueOrThrow({ where: { merchantId: owner.merchantId } });
    await a.http().get(`/internal/kyb/${app.id}/documents/${docId}/url`).set(STAFF).expect(200);
    await a.http().get(`/internal/kyb/${app.id}/documents/${docId}/url`).set({ 'X-Internal-Token': STAFF['X-Internal-Token'] }).expect(400);
    const views = await prisma.auditLog.findMany({ where: { action: 'kyb.document_viewed', targetId: docId }, orderBy: { createdAt: 'asc' } });
    expect(views.map((v) => `${v.actorType}:${v.actorId}`)).toEqual([expect.stringMatching(/^user:/), 'staff:conformite@alphapay.cg']);
  });

  it('droits : un caissier ne voit pas le dossier ; le back-office exige le jeton interne ; webhook KYC non signé refusé', async () => {
    const owner = await a.signUp();
    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    await a.http().get(`/v1/merchants/${owner.merchantId}/kyb`).set('Authorization', cashier.auth).expect(403);
    await a.http().get('/internal/kyb').expect(401);
    await a.http().post('/webhooks/kyc/mock').set('Content-Type', 'application/json').send({ applicantId: 'x', externalId: 'y', decision: 'approved' }).expect(401);
  });
});
