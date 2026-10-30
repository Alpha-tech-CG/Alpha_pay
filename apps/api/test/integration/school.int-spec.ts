import { prisma } from '@paybrain/database';
import { MOCK_MOBILE_MONEY_NUMBERS } from '@paybrain/providers';
import { WebhooksService } from '../../src/modules/webhooks/webhooks.service';
import { accounts } from './accounts';
import { createTestApp, TestApp } from './app';
import { db, resetDatabase } from './db';

jest.setTimeout(240_000);

/**
 * M8 Pack École (§M8, critères d'acceptation) sur Postgres réel :
 * - une école de 500 élèves est importée et ses échéanciers générés en moins de 2 minutes ;
 * - le directeur voit en un écran les impayés par classe ;
 * - un paiement d'un parent met à jour l'échéancier, le tableau de bord et le reçu au nom de l'élève.
 */
describe('M8 Pack École (HTTP, Postgres réel)', () => {
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

  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  async function school() {
    const owner = await a.signUp('ecole');
    const base = `/v1/merchants/${owner.merchantId}/school`;
    const year = await a.http().post(`${base}/years`).set('Authorization', owner.auth).send({ label: '2026-2027', starts_on: day(-30), ends_on: day(250) }).expect(201);
    const cm2 = await a.http().post(`${base}/years/${year.body.id}/classes`).set('Authorization', owner.auth).send({ name: 'CM2 A' }).expect(201);
    const cm1 = await a.http().post(`${base}/years/${year.body.id}/classes`).set('Authorization', owner.auth).send({ name: 'CM1 A' }).expect(201);
    return { owner, base, yearId: year.body.id as string, cm2: cm2.body.id as string, cm1: cm1.body.id as string };
  }

  function csv(n: number, from = 1) {
    const rows = ['matricule;prenom;nom;date_naissance;sexe;responsable_nom;responsable_telephone;responsable_email'];
    for (let i = from; i < from + n; i++) {
      rows.push(`M${String(i).padStart(4, '0')};Élève${i};Nom${i};12/03/2015;${i % 2 ? 'F' : 'M'};Parent ${i};06${String(1000000 + i).slice(-7)};`);
    }
    return Buffer.from(rows.join('\r\n'), 'utf8');
  }

  it('500 élèves importés et facturés en moins de 2 minutes ; impayés par classe en un écran ; paiement d’un parent', async () => {
    const { owner, base, yearId, cm2, cm1 } = await school();
    const started = Date.now();

    const imported = await a.http().post(`${base}/classes/${cm2}/import`).set('Authorization', owner.auth).attach('file', csv(500), 'eleves.csv').expect(200);
    expect(imported.body).toMatchObject({ created: 500, updated: 0, error_count: 0 });

    const grid = await a
      .http()
      .post(`${base}/years/${yearId}/fee-grids`)
      .set('Authorization', owner.auth)
      .send({
        label: 'Frais CM2',
        school_class_id: cm2,
        lines: [
          { label: 'Inscription', amount: 15000, due_date: day(-5) },
          { label: '1er trimestre', amount: 45000, due_date: day(20) },
          { label: '2e trimestre', amount: 45000, due_date: day(110) },
        ],
      })
      .expect(201);
    const applied = await a.http().post(`${base}/fee-grids/${grid.body.id}/apply`).set('Authorization', owner.auth).expect(200);
    expect(applied.body).toMatchObject({ invoices_created: 500, already_billed: 0, students_without_contact: [] });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(120_000);

    // Rejouable : aucune facture en double.
    const again = await a.http().post(`${base}/fee-grids/${grid.body.id}/apply`).set('Authorization', owner.auth).expect(200);
    expect(again.body).toMatchObject({ invoices_created: 0, already_billed: 500 });
    expect(await db.invoice.count({ where: { merchantId: owner.merchantId } })).toBe(500);

    // Un écran : impayés par classe (inscription échue pour tous).
    const dash = await a.http().get(`${base}/dashboard`).set('Authorization', owner.auth).expect(200);
    const byName = Object.fromEntries(dash.body.by_class.map((c: any) => [c.name, c]));
    expect(byName['CM2 A']).toMatchObject({ student_count: 500, expected: 500 * 105000, collected: 0, overdue: 500 * 15000, late_students: 500 });
    expect(byName['CM1 A']).toMatchObject({ student_count: 0, expected: 0 });

    // Un parent paie l'inscription de son enfant.
    const student = await db.student.findFirstOrThrow({ where: { merchantId: owner.merchantId, registrationNo: 'M0001' } });
    const detail = await a.http().get(`${base}/students/${student.id}`).set('Authorization', owner.auth).expect(200);
    const invoice = detail.body.invoices[0];
    expect(invoice.installments.map((i: any) => i.label)).toEqual(['Inscription', '1er trimestre', '2e trimestre']);
    const code = new URL(invoice.installments[0].payment_url).pathname.split('/').pop();
    const started2 = await a.http().post(`/v1/public/links/${code}/pay`).send({ phone: MOCK_MOBILE_MONEY_NUMBERS.success }).expect(201);
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: started2.body.id } });
    await t.app.get(WebhooksService).applyVerifiedStatus(tx, 'SUCCEEDED', undefined, 'test');

    const after = await a.http().get(`${base}/dashboard`).set('Authorization', owner.auth).expect(200);
    const cls = after.body.by_class.find((c: any) => c.name === 'CM2 A');
    expect(cls).toMatchObject({ collected: 15000, overdue: 499 * 15000, late_students: 499 });
    const late = await a.http().get(`${base}/late-students?class_id=${cm2}`).set('Authorization', owner.auth).expect(200);
    expect(late.body.data).toHaveLength(499);
    expect(late.body.data.find((s: any) => s.registration_no === 'M0001')).toBeUndefined();
    const lateCsv = await a.http().get(`${base}/late-students.csv`).set('Authorization', owner.auth).expect(200);
    expect(lateCsv.text.split('\r\n')).toHaveLength(500);

    // Reçu au nom de l'élève (classe, année).
    const receipt = await db.receipt.findFirstOrThrow({ where: { transactionId: tx.id }, include: { invoice: { include: { student: true } } } });
    expect(receipt.invoice?.student?.registrationNo).toBe('M0001');
    expect(receipt.payerName).toBe('Parent 1');

    // Réimport : un matricule connu met à jour (changement de classe), sans doublon.
    const moved = await a.http().post(`${base}/classes/${cm1}/import`).set('Authorization', owner.auth).attach('file', csv(2, 500), 'eleves.csv').expect(200);
    expect(moved.body).toMatchObject({ created: 1, updated: 1 });
    expect(await db.student.count({ where: { merchantId: owner.merchantId } })).toBe(501);
  });

  it('rapport d’erreurs ligne par ligne ; modèle téléchargeable ; contrôle d’accès et cloisonnement', async () => {
    const { owner, base, cm2 } = await school();
    const bad = Buffer.from('prenom;nom;responsable_nom;responsable_telephone\r\nAïcha;Ngoma;Mme Ngoma;061111111\r\n;Sans;;\r\nPaul;Mbemba;M. Mbemba;123\r\n', 'utf8');
    const report = await a.http().post(`${base}/classes/${cm2}/import`).set('Authorization', owner.auth).attach('file', bad, 'eleves.csv').expect(200);
    expect(report.body).toMatchObject({ created: 1, error_count: 2 });
    expect(report.body.errors.map((e: any) => e.line)).toEqual([3, 4]);

    const tpl = await a.http().get(`${base}/import-template?format=xlsx`).set('Authorization', owner.auth).expect(200);
    expect(tpl.headers['content-type']).toContain('spreadsheetml');

    const cashier = await a.inviteAndJoin(owner, 'CASHIER', 'caissier');
    const accountant = await a.inviteAndJoin(owner, 'ACCOUNTANT', 'comptable');
    await a.http().get(`${base}/dashboard`).set('Authorization', cashier.auth).expect(403);
    await a.http().get(`${base}/dashboard`).set('Authorization', accountant.auth).expect(200);
    await a.http().post(`${base}/classes/${cm2}/import`).set('Authorization', accountant.auth).attach('file', bad, 'eleves.csv').expect(403);

    // Une autre école ne peut ni lire ni écrire dans cette classe.
    const other = await a.signUp('autre');
    const otherBase = `/v1/merchants/${other.merchantId}/school`;
    await a.http().post(`${otherBase}/classes/${cm2}/import`).set('Authorization', other.auth).attach('file', bad, 'eleves.csv').expect(404);
    await a.http().post(`${otherBase}/students`).set('Authorization', other.auth).send({ first_name: 'X', last_name: 'Y', school_class_id: cm2 }).expect(404);
  });
});
