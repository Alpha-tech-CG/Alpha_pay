/**
 * Jeu de données de démonstration (§10.3), en mode TEST uniquement :
 * - « Quincaillerie du Plateau » : 2 boutiques, 3 caisses, un caissier,
 *   ~120 paiements MTN/Airtel sur 30 jours, cash déclaré, rapprochement,
 *   clients, factures dans tous les états, relances, reçus ;
 * - « École Les Manguiers » : année 2026-2027, 3 classes, 50 élèves et leurs
 *   responsables, grilles de frais, échéanciers, versements payés, retardataires.
 *
 * Passe par les vrais services de l'API (mêmes règles que l'application).
 * Refuse de tourner en production (sauf préproduction déclarée par
 * ALLOW_DEMO_SEED=true) et si les comptes de démo existent déjà.
 *
 *   pnpm --filter @paybrain/api demo:seed            (local)
 *   docker compose exec api node dist/scripts/demo-seed   (pile Docker)
 *
 * Mot de passe des comptes : DEMO_PASSWORD, sinon tiré au hasard et affiché une fois.
 */
import 'reflect-metadata';
import { randomBytes } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { prisma, Prisma } from '@paybrain/database';
import { deterministicHash, encryptField, maskPhone, normalizeEmail } from '@paybrain/shared';
import { AppModule } from '../app.module';
import { loadSecrets } from '../secrets/secrets-loader';
import { hashPassword } from '../modules/auth/password';
import { CustomersService } from '../modules/invoicing/customers.service';
import { InvoicesService } from '../modules/invoicing/invoices.service';
import { RecoveryService } from '../modules/invoicing/recovery.service';
import { SchoolService } from '../modules/school/school.service';
import { StoresService } from '../modules/stores/stores.service';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return (this as unknown as bigint).toString();
};

const DAY = 86_400_000;
const b = (buf: Buffer) => new Uint8Array(buf);
let rand = 42;
/** Pseudo-aléatoire déterministe : le même jeu à chaque exécution. */
function rnd(): number {
  rand = (rand * 1103515245 + 12345) % 2 ** 31;
  return rand / 2 ** 31;
}
const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

const FIRST = ['Grâce', 'Merveille', 'Destin', 'Exaucé', 'Divine', 'Prince', 'Ruth', 'Christ', 'Bénie', 'Josué', 'Esther', 'Daniel', 'Sarah', 'Glody', 'Plamedie', 'Junior', 'Fortune', 'Gloire'];
const LAST = ['Mabiala', 'Ngoma', 'Moukassa', 'Loubaki', 'Bouesso', 'Nkounkou', 'Massamba', 'Malonga', 'Mampouya', 'Itoua', 'Okemba', 'Ngouabi', 'Mavoungou', 'Kimbembe', 'Samba'];

async function createAccount(name: string, email: string, phone: string, password: string) {
  const e = normalizeEmail(email);
  const user = await prisma.appUser.create({
    data: {
      emailEncrypted: b(encryptField(e)),
      emailHash: b(deterministicHash(e)),
      phoneEncrypted: b(encryptField(phone)),
      phoneHash: b(deterministicHash(phone)),
      phoneMasked: maskPhone(phone),
      fullName: name,
      passwordHash: await hashPassword(password),
      preferredOtpChannel: 'EMAIL',
    },
  });
  return user;
}

async function owner(merchantName: string, email: string, phone: string, password: string, plan: string) {
  const user = await createAccount(merchantName, email, phone, password);
  const e = normalizeEmail(email);
  const merchant = await prisma.merchant.create({
    data: { name: merchantName, emailEncrypted: b(encryptField(e)), emailHash: b(deterministicHash(e)), onboardingStatus: 'PENDING', isActive: true, ownerUserId: user.id },
  });
  const member = await prisma.merchantMember.create({ data: { merchantId: merchant.id, userId: user.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } });
  const p = await prisma.billingPlan.findUnique({ where: { code: plan } });
  if (p) {
    await prisma.subscription.create({ data: { merchantId: merchant.id, planId: p.id, status: 'ACTIVE', periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * DAY) } });
  }
  return { user, merchant, member, actor: { userId: user.id, memberId: member.id, role: 'OWNER' as const, ip: '127.0.0.1' } };
}

let seq = 0;
/** Paiement réussi (ou non) déjà confirmé par l'opérateur factice, puis ses effets (reçu, facture). */
async function payment(
  recovery: RecoveryService,
  merchantId: string,
  p: { amount: number; at: Date; status?: 'SUCCEEDED' | 'FAILED' | 'EXPIRED'; operator?: 'MTN' | 'AIRTEL'; tillId?: string; storeId?: string; linkId?: string; description?: string },
) {
  seq++;
  const phone = `+24206${String(5000000 + seq).slice(-7)}`;
  const tx = await prisma.transaction.create({
    data: {
      merchantId,
      livemode: false,
      externalId: `AP-DEMO-${String(seq).padStart(5, '0')}`,
      amount: BigInt(p.amount),
      currency: 'XAF',
      operator: p.operator ?? (rnd() < 0.62 ? 'MTN' : 'AIRTEL'),
      status: p.status ?? 'SUCCEEDED',
      tillId: p.tillId ?? null,
      storeId: p.storeId ?? null,
      paymentLinkId: p.linkId ?? null,
      payerPhoneMask: maskPhone(phone),
      payerMessage: p.description ?? null,
      failureReason: p.status === 'FAILED' ? 'Refusé par le payeur' : null,
      createdAt: p.at,
      updatedAt: new Date(p.at.getTime() + 40_000),
    },
  });
  if (tx.status === 'SUCCEEDED') {
    if (p.linkId) await prisma.paymentLink.updateMany({ where: { id: p.linkId, livemode: false, multiUse: false }, data: { usedAt: p.at } });
    await recovery.onPaymentSucceeded(tx);
  }
  return tx;
}

async function main() {
  await loadSecrets();
  // La préproduction tourne en NODE_ENV=production : elle s'annonce explicitement.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Le jeu de démonstration ne se charge jamais en production (préproduction : ALLOW_DEMO_SEED=true).');
  }
  const shop = 'demo.commerce@alphapay.test';
  const school = 'demo.ecole@alphapay.test';
  for (const email of [shop, school]) {
    if (await prisma.appUser.findFirst({ where: { emailHash: b(deterministicHash(normalizeEmail(email))) } })) {
      console.error(`Le compte de démo ${email} existe déjà : jeu de démonstration déjà chargé.`);
      process.exit(1);
    }
  }
  const password = process.env.DEMO_PASSWORD ?? `Demo-${randomBytes(9).toString('base64url')}`;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const stores = app.get(StoresService);
  const customers = app.get(CustomersService);
  const invoices = app.get(InvoicesService);
  const recovery = app.get(RecoveryService);
  const schools = app.get(SchoolService);

  // ─── Commerçant ────────────────────────────────────────────────────────────
  const q = await owner('Quincaillerie du Plateau', shop, '+242066100001', password, 'pro');
  const mid = q.merchant.id;
  const plateau = await stores.createStore(mid, { name: 'Plateau - Centre-ville', address: 'Avenue Amilcar Cabral, Brazzaville' }, q.actor);
  const poto = await stores.createStore(mid, { name: 'Poto-Poto', address: 'Rue Mbochis, Brazzaville' }, q.actor);
  const tills = [
    { ...(await stores.createTill(mid, plateau.id, { name: 'Caisse 1' }, q.actor)), storeId: plateau.id },
    { ...(await stores.createTill(mid, plateau.id, { name: 'Caisse 2' }, q.actor)), storeId: plateau.id },
    { ...(await stores.createTill(mid, poto.id, { name: 'Caisse principale' }, q.actor)), storeId: poto.id },
  ];
  const cashierUser = await createAccount('Aïcha Moukassa (caissière)', 'demo.caisse@alphapay.test', '+242066100003', password);
  const cashier = await prisma.merchantMember.create({ data: { merchantId: mid, userId: cashierUser.id, role: 'CASHIER', status: 'ACTIVE', joinedAt: new Date() } });
  await stores.assignMember(mid, tills[0].id, cashier.id, q.actor);

  // ~120 paiements sur 30 jours, heures d'ouverture.
  for (let d = 29; d >= 0; d--) {
    const n = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const till = pick(tills);
      const at = new Date(Date.now() - d * DAY);
      at.setUTCHours(7 + Math.floor(rnd() * 10), Math.floor(rnd() * 60), 0, 0);
      if (at > new Date()) at.setTime(Date.now() - 60_000 * (i + 1));
      const r = rnd();
      await payment(recovery, mid, {
        amount: pick([2500, 3500, 5000, 7500, 12000, 15000, 25000, 48000, 75000]),
        at,
        status: r < 0.9 ? 'SUCCEEDED' : r < 0.96 ? 'FAILED' : 'EXPIRED',
        tillId: till.id,
        storeId: till.storeId,
        description: pick(['Ciment', 'Tôles', 'Peinture', 'Clous et vis', 'Fer à béton', 'Robinetterie', 'Câble électrique']),
      });
    }
    // Cash déclaré, un jour sur deux, sur la caisse 1.
    if (d % 2 === 0) {
      await prisma.cashEntry.create({ data: { merchantId: mid, livemode: false, tillId: tills[0].id, memberId: cashier.id, amount: BigInt(20000 + Math.floor(rnd() * 8) * 5000), entryDate: new Date(`${isoDay(-d)}T00:00:00.000Z`), note: 'Espèces du jour' } });
    }
  }
  // Rapprochements des derniers jours.
  for (let d = 7; d >= 1; d--) {
    await prisma.reconciliationDay.create({
      data: { merchantId: mid, livemode: false, entryDate: new Date(`${isoDay(-d)}T00:00:00.000Z`), status: d === 3 ? 'DISCREPANCY' : 'OK', comment: d === 3 ? 'Écart de 5 000 XAF : remboursement client en espèces' : null, reviewedById: q.member.id, reviewedAt: new Date() },
    });
  }

  // Clients et factures dans tous les états.
  const clients = [];
  for (const [name, phone, channels] of [
    ['Entreprise BTP Congo Bâtir', '061234501', ['whatsapp', 'sms']],
    ['Jean-Pierre Mabiala', '061234502', ['sms']],
    ['Hôtel Les Palmiers', '061234503', ['whatsapp', 'sms']],
    ['Paroisse Sainte-Anne', '061234504', ['sms']],
    ['Moukassa et Fils', '061234505', ['whatsapp', 'sms']],
    ['Clinique du Plateau', '061234506', ['sms']],
  ] as const) {
    clients.push(await customers.create(mid, false, { name, phone, channels: [...channels] }));
  }
  const userActor = { type: 'user' as const, id: q.user.id };
  const line = (description: string, quantity: number, unit_price: number) => ({ description, quantity, unit_price });
  // Payée.
  const paid = await invoices.create(mid, false, { customer_id: clients[0].id, due_date: isoDay(5), lines: [line('Ciment CPJ 45 (sac 50 kg)', 40, 6500), line('Fer à béton 10 mm', 60, 3800)], send: true }, userActor);
  const paidLink = await prisma.invoice.findUniqueOrThrow({ where: { id: paid.id } });
  await payment(recovery, mid, { amount: paid.total, at: new Date(Date.now() - 2 * DAY), linkId: paidLink.paymentLinkId!, description: `Facture ${paid.number}` });
  // Partiellement payée (échéancier).
  const partial = await invoices.create(
    mid,
    false,
    { customer_id: clients[2].id, lines: [line('Rénovation plomberie (forfait)', 1, 450000)], installments: [{ due_date: isoDay(-10), amount: 150000, label: 'Acompte' }, { due_date: isoDay(20), amount: 150000, label: '2e versement' }, { due_date: isoDay(50), amount: 150000, label: 'Solde' }], send: true },
    userActor,
  );
  const firstInst = await prisma.invoiceInstallment.findFirstOrThrow({ where: { invoiceId: partial.id, position: 1 } });
  await payment(recovery, mid, { amount: 150000, at: new Date(Date.now() - 11 * DAY), linkId: firstInst.paymentLinkId!, description: `Facture ${partial.number} - acompte` });
  // En retard.
  const late = await invoices.create(mid, false, { customer_id: clients[1].id, due_date: isoDay(-6), lines: [line('Tôles ondulées 3 m', 25, 7200)], send: true }, userActor);
  await prisma.invoice.update({ where: { id: late.id }, data: { status: 'OVERDUE', issueDate: new Date(Date.now() - 20 * DAY) } });
  await prisma.invoiceReminder.createMany({
    data: [
      { invoiceId: late.id, daysOffset: -3, scheduledFor: new Date(Date.now() - 9 * DAY), status: 'SENT', sentAt: new Date(Date.now() - 9 * DAY), channel: 'SMS' },
      { invoiceId: late.id, daysOffset: 0, scheduledFor: new Date(Date.now() - 6 * DAY), status: 'SENT', sentAt: new Date(Date.now() - 6 * DAY), channel: 'SMS' },
      { invoiceId: late.id, daysOffset: 3, scheduledFor: new Date(Date.now() - 3 * DAY), status: 'SENT', sentAt: new Date(Date.now() - 3 * DAY), channel: 'SMS' },
    ],
  });
  // Envoyée, brouillon, annulée.
  await invoices.create(mid, false, { customer_id: clients[3].id, due_date: isoDay(12), lines: [line('Peinture glycéro 20 L', 6, 38000), line('Rouleaux et pinceaux', 1, 15000)], send: true }, userActor);
  await invoices.create(mid, false, { customer_id: clients[4].id, due_date: isoDay(30), lines: [line('Groupe électrogène 5 kVA', 1, 850000)] }, userActor);
  const voided = await invoices.create(mid, false, { customer_id: clients[5].id, due_date: isoDay(15), lines: [line('Câble 2,5 mm² (rouleau)', 4, 28000)], send: true }, userActor);
  await invoices.void(mid, false, voided.id, userActor);

  // ─── École ─────────────────────────────────────────────────────────────────
  const e = await owner('École Les Manguiers', school, '+242066100002', password, 'etablissement');
  const sid = e.merchant.id;
  const eActor = { type: 'user' as const, id: e.user.id };
  const year = await schools.createYear(sid, { label: '2026-2027', starts_on: '2026-10-01', ends_on: '2027-07-15' });
  const classes = [];
  for (const [name, count, fees] of [
    ['CM1', 17, [12000, 40000, 40000, 40000]],
    ['CM2', 17, [12000, 45000, 45000, 45000]],
    ['6e', 16, [15000, 55000, 55000, 55000]],
  ] as const) {
    const cls = await schools.createClass(sid, year.id, { name, capacity: 40 });
    const rows = ['matricule;prenom;nom;date_naissance;sexe;responsable_nom;responsable_telephone;responsable_lien;responsable2_nom;responsable2_telephone'];
    for (let i = 0; i < count; i++) {
      const last = pick(LAST);
      const n = classes.length * 100 + i + 1;
      rows.push(
        [`2026-${String(n).padStart(3, '0')}`, pick(FIRST), last, `${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}/0${1 + Math.floor(rnd() * 9)}/${2015 - classes.length}`, rnd() < 0.5 ? 'F' : 'M', `${pick(['Marie', 'Jeanne', 'Paul', 'Pierre', 'Chantal', 'Albert'])} ${last}`, `06${String(7000000 + n)}`, pick(['Mère', 'Père', 'Tuteur']), i % 4 === 0 ? `${pick(['Joseph', 'Brigitte'])} ${last}` : '', i % 4 === 0 ? `05${String(7000000 + n)}` : ''].join(';'),
      );
    }
    const report = await schools.importStudents(sid, cls.id, { buffer: Buffer.from(rows.join('\r\n'), 'utf8'), originalname: 'eleves.csv' }, eActor);
    const grid = await schools.createFeeGrid(sid, year.id, {
      label: `Frais ${name} 2026-2027`,
      school_class_id: cls.id,
      lines: [
        { label: 'Inscription', amount: fees[0], due_date: '2026-10-15' },
        { label: '1er trimestre', amount: fees[1], due_date: '2026-10-31' },
        { label: '2e trimestre', amount: fees[2], due_date: '2027-01-15' },
        { label: '3e trimestre', amount: fees[3], due_date: '2027-04-15' },
      ],
    });
    await schools.applyFeeGrid(sid, grid.id, false, eActor);
    classes.push({ cls, report });
  }
  // Paiements des parents : la plupart ont payé l'inscription, une partie le 1er trimestre.
  const insts = await prisma.invoiceInstallment.findMany({ where: { invoice: { merchantId: sid } }, orderBy: [{ invoiceId: 'asc' }, { position: 'asc' }] });
  const byInvoice = new Map<string, typeof insts>();
  for (const i of insts) byInvoice.set(i.invoiceId, [...(byInvoice.get(i.invoiceId) ?? []), i]);
  let k = 0;
  for (const list of byInvoice.values()) {
    k++;
    const paidCount = k % 7 === 0 ? 0 : k % 3 === 0 ? 1 : 2; // ~14 % rien, ~29 % inscription, le reste inscription + T1
    for (const inst of list.slice(0, paidCount)) {
      await payment(recovery, sid, { amount: Number(inst.amount), at: new Date(inst.dueDate.getTime() - Math.floor(rnd() * 5) * DAY), linkId: inst.paymentLinkId!, description: inst.label ?? undefined });
    }
  }

  await app.close();
  const [txCount, receiptCount, invoiceCount, studentCount] = await Promise.all([
    prisma.transaction.count({ where: { merchantId: { in: [mid, sid] }, livemode: false } }),
    prisma.receipt.count({ where: { merchantId: { in: [mid, sid] } } }),
    prisma.invoice.count({ where: { merchantId: { in: [mid, sid] } } }),
    prisma.student.count({ where: { merchantId: sid } }),
  ]);
  console.log('\n── Démonstration AlphaPay chargée (mode test) ──');
  console.log(`  Commerçant : ${shop}  (caissière : demo.caisse@alphapay.test)`);
  console.log(`  École      : ${school}`);
  console.log(process.env.DEMO_PASSWORD ? '  Mot de passe : DEMO_PASSWORD' : `  Mot de passe (affiché une seule fois) : ${password}`);
  console.log('  Connexion : mot de passe puis code reçu par email (MailHog, http://localhost:8025).');
  console.log(`  ${txCount} paiements, ${receiptCount} reçus, ${invoiceCount} factures, ${studentCount} élèves (${classes.map((c) => `${c.cls.name} : ${c.report.created}`).join(', ')}).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Prisma.PrismaClientKnownRequestError ? `${err.code} ${err.message}` : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
