import { HttpStatus, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AppUser, Prisma, PrismaClient, Transaction } from '@paybrain/database';
import { toE164 } from '@paybrain/shared';
import { ApiError } from '../../common/errors/api-error';
import { PaymentHooks } from '../../common/payments/payment-hooks';
import { decryptField, deterministicHash } from '../../common/security/pii-crypto';
import { CATEGORIES, CATEGORY_KEYS, categoryName, guessCategory, normalizeLabel, suggestBudget } from './categories';
import type { AccountDto, ContributionDto, EntryDto, EnvelopeDto, GoalDto, PaymentRequestDto, SettingsDto, SetupDto, TransferDto, UpdateAccountDto, UpdateEntryDto, UpdateEnvelopeDto, UpdateGoalDto } from './personal.dto';

const b = (buf: Buffer) => new Uint8Array(buf);
const n = (v: bigint | null | undefined) => Number(v ?? 0n);
const HANDLE_SUFFIX = '.alphapay';
const MILESTONES = [25, 50, 75, 100];

/** Début et fin d'un mois à Brazzaville (UTC+1) ; `month` = AAAA-MM, défaut : mois courant. */
export function monthWindow(month?: string): { start: Date; end: Date; key: string } {
  const now = new Date(Date.now() + 3_600_000);
  const [y, m] = month && /^\d{4}-\d{2}$/.test(month) ? month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(y, m - 1, 1) - 3_600_000);
  const end = new Date(Date.UTC(y, m, 1) - 3_600_000);
  return { start, end, key: `${y}-${String(m).padStart(2, '0')}` };
}

/** Identifiant AlphaPay unique dérivé du nom (« Zlatan Mabiala » → « zlatan.mabiala »). */
export async function createPersonalProfile(tx: Prisma.TransactionClient, userId: string, name: string) {
  const base = normalizeLabel(name).replace(/ /g, '.').replace(/[^a-z0-9.]/g, '').slice(0, 24) || 'membre';
  let handle = base.length >= 3 ? base : `${base}.ap`;
  for (let i = 0; await tx.personalProfile.findUnique({ where: { handle } }); i++) {
    handle = `${base}${Math.floor(10 + Math.random() * 990)}`;
    if (i > 20) handle = `${base}.${randomBytes(3).toString('hex')}`;
  }
  return tx.personalProfile.create({ data: { userId, handle } });
}

export const displayHandle = (handle: string) => `@${handle}${HANDLE_SUFFIX}`;

/**
 * Espace particulier (D-065). AlphaPay ne détient aucun fonds : les soldes sont ceux
 * déclarés par l'utilisateur, l'épargne est suivie (l'argent reste sur son compte), les
 * envois AlphaPay passent de MoMo à MoMo et sont seulement enregistrés des deux côtés.
 */
@Injectable()
export class PersonalService implements OnModuleInit {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly hooks: PaymentHooks,
  ) {}

  /** Un paiement réussi chez un marchand AlphaPay entre dans le budget du payeur. */
  onModuleInit() {
    this.hooks.onSucceeded('budget', (tx) => this.importPayment(tx));
  }

  // ─── Profil, configuration ─────────────────────────────────────────────

  async profile(userId: string) {
    const p = await this.prisma.personalProfile.findUnique({ where: { userId } });
    if (!p) throw new ApiError(HttpStatus.FORBIDDEN, 'espace_particulier_inactif', 'Espace particulier non activé');
    return p;
  }

  /** Active l'espace particulier pour un compte existant (marchand, par exemple). */
  async activate(userId: string) {
    const existing = await this.prisma.personalProfile.findUnique({ where: { userId } });
    if (existing) return this.presentProfile(existing);
    const user = await this.prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
    const created = await this.prisma.$transaction((tx) => createPersonalProfile(tx, userId, user.fullName ?? 'membre'));
    return this.presentProfile(created);
  }

  presentProfile(p: { handle: string; monthlyIncome: bigint | null; incomeIrregular: boolean; roundUpEnabled: boolean; roundUpTo: number; roundUpGoalId: string | null; onboardedAt: Date | null }) {
    return {
      handle: p.handle,
      alphapay_id: displayHandle(p.handle),
      monthly_income: p.monthlyIncome != null ? n(p.monthlyIncome) : null,
      income_irregular: p.incomeIrregular,
      round_up: { enabled: p.roundUpEnabled, to: p.roundUpTo, goal_id: p.roundUpGoalId },
      onboarded: !!p.onboardedAt,
      qr_payload: `alphapay:${displayHandle(p.handle)}`,
    };
  }

  suggestion(income: number) {
    return { envelopes: suggestBudget(income) };
  }

  async setup(userId: string, dto: SetupDto) {
    await this.profile(userId);
    const wanted = new Map(dto.envelopes.map((e) => [e.key, e.planned]));
    await this.prisma.$transaction(async (tx) => {
      await tx.personalProfile.update({
        where: { userId },
        data: { monthlyIncome: dto.monthly_income != null ? BigInt(dto.monthly_income) : null, incomeIrregular: !!dto.income_irregular, onboardedAt: new Date() },
      });
      const existing = await tx.envelope.findMany({ where: { userId } });
      let position = 0;
      for (const c of CATEGORIES) {
        if (!wanted.has(c.key)) continue;
        const planned = BigInt(wanted.get(c.key)!);
        const env = existing.find((e) => e.key === c.key);
        if (env) await tx.envelope.update({ where: { id: env.id }, data: { planned, archivedAt: null, position } });
        else await tx.envelope.create({ data: { userId, key: c.key, name: c.name, icon: c.icon, planned, position } });
        position++;
      }
      if (dto.goal_name && dto.goal_target) {
        await tx.savingsGoal.create({ data: { userId, name: dto.goal_name, emoji: '🎯', target: BigInt(dto.goal_target) } });
      }
    });
    return this.overview(userId);
  }

  async updateSettings(userId: string, dto: SettingsDto) {
    await this.profile(userId);
    if (dto.round_up_goal_id) await this.goal(userId, dto.round_up_goal_id);
    const p = await this.prisma.personalProfile.update({
      where: { userId },
      data: {
        ...(dto.monthly_income !== undefined ? { monthlyIncome: BigInt(dto.monthly_income) } : {}),
        ...(dto.income_irregular !== undefined ? { incomeIrregular: dto.income_irregular } : {}),
        ...(dto.round_up_enabled !== undefined ? { roundUpEnabled: dto.round_up_enabled } : {}),
        ...(dto.round_up_to !== undefined ? { roundUpTo: dto.round_up_to } : {}),
        ...(dto.round_up_goal_id !== undefined ? { roundUpGoalId: dto.round_up_goal_id } : {}),
      },
    });
    return this.presentProfile(p);
  }

  // ─── Vue unifiée ───────────────────────────────────────────────────────

  async overview(userId: string, month?: string) {
    const profile = await this.profile(userId);
    const w = monthWindow(month);
    const [accounts, envelopes, goals, sums, saved, unread] = await Promise.all([
      this.prisma.personalAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.envelopes(userId, month),
      this.goals(userId),
      this.prisma.budgetEntry.groupBy({ by: ['direction'], where: { userId, occurredAt: { gte: w.start, lt: w.end } }, _sum: { amount: true } }),
      this.prisma.goalContribution.aggregate({ where: { goal: { userId }, createdAt: { gte: w.start, lt: w.end } }, _sum: { amount: true } }),
      this.prisma.personalAlert.count({ where: { userId, readAt: null } }),
    ]);
    const spent = n(sums.find((s) => s.direction === 'OUT')?._sum.amount);
    const income = n(sums.find((s) => s.direction === 'IN')?._sum.amount);
    const planned = envelopes.reduce((a, e) => a + (e.key === 'savings' ? 0 : e.planned), 0);
    const total = accounts.reduce((a, x) => a + n(x.balance), 0);
    return {
      month: w.key,
      profile: this.presentProfile(profile),
      total_balance: total,
      accounts: accounts.map((a) => ({ id: a.id, kind: a.kind.toLowerCase(), label: a.label, balance: n(a.balance) })),
      spent_this_month: spent,
      income_this_month: income,
      saved_this_month: n(saved._sum.amount),
      // Reste à dépenser : budget prévu (hors épargne) moins dépenses ; sans budget, solde total.
      remaining_to_spend: planned > 0 ? planned - spent : total,
      envelopes,
      goals,
      unread_alerts: unread,
    };
  }

  // ─── Comptes suivis ────────────────────────────────────────────────────

  async createAccount(userId: string, dto: AccountDto) {
    await this.profile(userId);
    const a = await this.prisma.personalAccount.create({ data: { userId, kind: dto.kind.toUpperCase() as any, label: dto.label.trim(), balance: BigInt(dto.balance) } });
    return { id: a.id, kind: a.kind.toLowerCase(), label: a.label, balance: n(a.balance) };
  }

  async updateAccount(userId: string, id: string, dto: UpdateAccountDto) {
    const a = await this.prisma.personalAccount.findFirst({ where: { id, userId } });
    if (!a) throw new ApiError(HttpStatus.NOT_FOUND, 'compte_introuvable', 'Compte introuvable', 'id');
    const u = await this.prisma.personalAccount.update({ where: { id }, data: { ...(dto.label ? { label: dto.label.trim() } : {}), ...(dto.balance !== undefined ? { balance: BigInt(dto.balance) } : {}) } });
    return { id: u.id, kind: u.kind.toLowerCase(), label: u.label, balance: n(u.balance) };
  }

  async deleteAccount(userId: string, id: string) {
    const r = await this.prisma.personalAccount.deleteMany({ where: { id, userId } });
    if (!r.count) throw new ApiError(HttpStatus.NOT_FOUND, 'compte_introuvable', 'Compte introuvable', 'id');
    await this.prisma.budgetEntry.updateMany({ where: { userId, accountId: id }, data: { accountId: null } });
    return { ok: true };
  }

  // ─── Enveloppes ────────────────────────────────────────────────────────

  async envelopes(userId: string, month?: string) {
    const w = monthWindow(month);
    const [list, spent] = await Promise.all([
      this.prisma.envelope.findMany({ where: { userId, archivedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.budgetEntry.groupBy({ by: ['envelopeId'], where: { userId, direction: 'OUT', envelopeId: { not: null }, occurredAt: { gte: w.start, lt: w.end } }, _sum: { amount: true } }),
    ]);
    const byEnv = new Map(spent.map((s) => [s.envelopeId, n(s._sum.amount)]));
    return list.map((e) => {
      const used = byEnv.get(e.id) ?? 0;
      const planned = n(e.planned);
      return { id: e.id, key: e.key, name: e.name, icon: e.icon, planned, spent: used, remaining: planned - used, progress: planned > 0 ? Math.round((used / planned) * 100) : 0, alert_threshold: e.alertThreshold };
    });
  }

  async createEnvelope(userId: string, dto: EnvelopeDto) {
    await this.profile(userId);
    const count = await this.prisma.envelope.count({ where: { userId, archivedAt: null } });
    if (count >= 20) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'trop_d_enveloppes', '20 enveloppes au plus');
    await this.prisma.envelope.create({ data: { userId, name: dto.name.trim(), icon: dto.icon ?? 'archive', planned: BigInt(dto.planned), alertThreshold: dto.alert_threshold ?? 80, position: count } });
    return this.envelopes(userId);
  }

  async updateEnvelope(userId: string, id: string, dto: UpdateEnvelopeDto) {
    await this.envelope(userId, id);
    await this.prisma.envelope.update({ where: { id }, data: { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.planned !== undefined ? { planned: BigInt(dto.planned) } : {}), ...(dto.alert_threshold ? { alertThreshold: dto.alert_threshold } : {}) } });
    return this.envelopes(userId);
  }

  /** Suppression = archivage : l'historique garde ses mouvements. */
  async deleteEnvelope(userId: string, id: string) {
    await this.envelope(userId, id);
    await this.prisma.envelope.update({ where: { id }, data: { archivedAt: new Date() } });
    return this.envelopes(userId);
  }

  private async envelope(userId: string, id: string) {
    const e = await this.prisma.envelope.findFirst({ where: { id, userId, archivedAt: null } });
    if (!e) throw new ApiError(HttpStatus.NOT_FOUND, 'enveloppe_introuvable', 'Enveloppe introuvable', 'envelope_id');
    return e;
  }

  // ─── Mouvements et catégorisation ──────────────────────────────────────

  /** Catégorie proposée : règle apprise de l'utilisateur, sinon mots-clés. */
  async categorize(userId: string, label: string, direction: 'IN' | 'OUT') {
    const pattern = normalizeLabel(label);
    const rule = pattern ? await this.prisma.categoryRule.findUnique({ where: { userId_pattern: { userId, pattern } } }) : null;
    const category = rule?.category ?? guessCategory(label, direction);
    let envelopeId = rule?.envelopeId ?? null;
    if (!envelopeId && direction === 'OUT') {
      envelopeId = (await this.prisma.envelope.findFirst({ where: { userId, key: category, archivedAt: null }, select: { id: true } }))?.id ?? null;
    }
    return { category, category_name: categoryName(category), envelope_id: envelopeId, learned: !!rule };
  }

  async entries(userId: string, month?: string, envelopeId?: string) {
    await this.profile(userId);
    const w = monthWindow(month);
    const rows = await this.prisma.budgetEntry.findMany({
      where: { userId, occurredAt: { gte: w.start, lt: w.end }, ...(envelopeId ? { envelopeId } : {}) },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return { month: w.key, data: rows.map((e) => this.presentEntry(e)) };
  }

  private presentEntry(e: { id: string; direction: string; amount: bigint; category: string; label: string; note: string | null; source: string; accountId: string | null; envelopeId: string | null; roundUp: bigint; occurredAt: Date }) {
    return {
      id: e.id,
      direction: e.direction.toLowerCase(),
      amount: n(e.amount),
      category: e.category,
      category_name: categoryName(e.category),
      label: e.label,
      note: e.note,
      source: e.source.toLowerCase(),
      account_id: e.accountId,
      envelope_id: e.envelopeId,
      round_up: n(e.roundUp),
      occurred_at: e.occurredAt,
    };
  }

  async createEntry(userId: string, dto: EntryDto) {
    const profile = await this.profile(userId);
    const direction = dto.direction === 'in' ? 'IN' : 'OUT';
    if (dto.account_id && !(await this.prisma.personalAccount.findFirst({ where: { id: dto.account_id, userId } }))) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'compte_introuvable', 'Compte introuvable', 'account_id');
    }
    if (dto.envelope_id) await this.envelope(userId, dto.envelope_id);
    if (dto.category && !CATEGORY_KEYS.has(dto.category)) throw new ApiError(HttpStatus.BAD_REQUEST, 'categorie_inconnue', 'Catégorie inconnue', 'category');
    const guess = await this.categorize(userId, dto.label, direction);
    const category = dto.category ?? guess.category;
    const envelopeId = direction === 'OUT' ? dto.envelope_id ?? guess.envelope_id : null;
    const roundUp = direction === 'OUT' && profile.roundUpEnabled ? this.roundUp(dto.amount, profile.roundUpTo) : 0;

    const entry = await this.prisma.$transaction(async (tx) => {
      const created = await tx.budgetEntry.create({
        data: {
          userId, direction, amount: BigInt(dto.amount), category, label: dto.label.trim(), note: dto.note, accountId: dto.account_id, envelopeId,
          roundUp: BigInt(roundUp), occurredAt: dto.occurred_at ? new Date(dto.occurred_at) : new Date(),
        },
      });
      if (dto.account_id) {
        await tx.personalAccount.update({ where: { id: dto.account_id }, data: { balance: { [direction === 'OUT' ? 'decrement' : 'increment']: BigInt(dto.amount) } } });
      }
      return created;
    });
    if (roundUp > 0 && profile.roundUpGoalId) await this.contribute(userId, profile.roundUpGoalId, { amount: roundUp, note: `Arrondi : ${dto.label.trim()}` }, 'ROUND_UP');
    await this.checkAlerts(userId, entry);
    return this.presentEntry(entry);
  }

  /** Arrondi au multiple supérieur : 4 750 → 5 000 épargne 250 (rien si déjà rond). */
  roundUp(amount: number, to: number): number {
    const r = amount % to;
    return r === 0 ? 0 : to - r;
  }

  async updateEntry(userId: string, id: string, dto: UpdateEntryDto) {
    const e = await this.prisma.budgetEntry.findFirst({ where: { id, userId } });
    if (!e) throw new ApiError(HttpStatus.NOT_FOUND, 'mouvement_introuvable', 'Mouvement introuvable', 'id');
    if (dto.category && !CATEGORY_KEYS.has(dto.category)) throw new ApiError(HttpStatus.BAD_REQUEST, 'categorie_inconnue', 'Catégorie inconnue', 'category');
    if (dto.envelope_id) await this.envelope(userId, dto.envelope_id);
    const category = dto.category ?? e.category;
    const envelopeId = dto.envelope_id !== undefined ? dto.envelope_id || null : e.envelopeId;
    const updated = await this.prisma.budgetEntry.update({ where: { id }, data: { category, envelopeId } });
    // Apprentissage : ce libellé ira désormais dans cette catégorie et cette enveloppe.
    const pattern = normalizeLabel(e.label);
    if (pattern) {
      await this.prisma.categoryRule.upsert({
        where: { userId_pattern: { userId, pattern } },
        create: { userId, pattern, category, envelopeId },
        update: { category, envelopeId, hits: { increment: 1 } },
      });
    }
    await this.checkAlerts(userId, updated);
    return this.presentEntry(updated);
  }

  async deleteEntry(userId: string, id: string) {
    const e = await this.prisma.budgetEntry.findFirst({ where: { id, userId } });
    if (!e) throw new ApiError(HttpStatus.NOT_FOUND, 'mouvement_introuvable', 'Mouvement introuvable', 'id');
    if (e.source === 'ALPHAPAY_TRANSFER') throw new ApiError(HttpStatus.CONFLICT, 'mouvement_transfert', 'Un envoi AlphaPay s’annule depuis l’envoi lui-même');
    await this.prisma.$transaction(async (tx) => {
      await tx.budgetEntry.delete({ where: { id } });
      if (e.accountId) await tx.personalAccount.updateMany({ where: { id: e.accountId, userId }, data: { balance: { [e.direction === 'OUT' ? 'increment' : 'decrement']: e.amount } } });
    });
    return { ok: true };
  }

  /** Paiement chez un marchand AlphaPay : importé dans le budget du payeur (par son numéro). */
  async importPayment(tx: Transaction) {
    if (!tx.payerPhoneHash) return;
    if (!tx.livemode && process.env.PERSONAL_IMPORT_TEST_PAYMENTS === 'false') return;
    const user = await this.prisma.appUser.findUnique({ where: { phoneHash: tx.payerPhoneHash }, include: { personal: true } });
    if (!user?.personal) return;
    const merchant = await this.prisma.merchant.findUnique({ where: { id: tx.merchantId }, select: { name: true } });
    const label = `${merchant?.name ?? 'Marchand'}${tx.livemode ? '' : ' (test)'}`;
    const guess = await this.categorize(user.id, merchant?.name ?? '', 'OUT');
    try {
      const entry = await this.prisma.budgetEntry.create({
        data: { userId: user.id, direction: 'OUT', amount: tx.amount, category: guess.category, envelopeId: guess.envelope_id, label, source: 'ALPHAPAY_PAYMENT', sourceRef: tx.id, occurredAt: tx.updatedAt },
      });
      await this.checkAlerts(user.id, entry);
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err; // déjà importé (rejeu du callback)
    }
  }

  // ─── Objectifs d'épargne ───────────────────────────────────────────────

  async goals(userId: string) {
    const list = await this.prisma.savingsGoal.findMany({ where: { userId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
    return list.map((g) => this.presentGoal(g));
  }

  private presentGoal(g: { id: string; name: string; emoji: string; target: bigint; saved: bigint; targetDate: Date | null }) {
    const target = n(g.target);
    const saved = n(g.saved);
    return { id: g.id, name: g.name, emoji: g.emoji, target, saved, progress: target ? Math.min(100, Math.round((saved / target) * 100)) : 0, target_date: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : null };
  }

  private async goal(userId: string, id: string) {
    const g = await this.prisma.savingsGoal.findFirst({ where: { id, userId, archivedAt: null } });
    if (!g) throw new ApiError(HttpStatus.NOT_FOUND, 'objectif_introuvable', 'Objectif introuvable', 'goal_id');
    return g;
  }

  async createGoal(userId: string, dto: GoalDto) {
    await this.profile(userId);
    const g = await this.prisma.savingsGoal.create({ data: { userId, name: dto.name.trim(), emoji: dto.emoji ?? '🎯', target: BigInt(dto.target), targetDate: dto.target_date ? new Date(dto.target_date) : null } });
    return this.presentGoal(g);
  }

  async updateGoal(userId: string, id: string, dto: UpdateGoalDto) {
    await this.goal(userId, id);
    const g = await this.prisma.savingsGoal.update({
      where: { id },
      data: { ...(dto.name ? { name: dto.name.trim() } : {}), ...(dto.emoji ? { emoji: dto.emoji } : {}), ...(dto.target ? { target: BigInt(dto.target) } : {}), ...(dto.target_date ? { targetDate: new Date(dto.target_date) } : {}) },
    });
    return this.presentGoal(g);
  }

  async archiveGoal(userId: string, id: string) {
    await this.goal(userId, id);
    await this.prisma.savingsGoal.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.prisma.personalProfile.updateMany({ where: { userId, roundUpGoalId: id }, data: { roundUpGoalId: null } });
    return { ok: true };
  }

  /** Versement ou retrait suivi ; jamais en dessous de zéro ; paliers 25/50/75/100 %. */
  async contribute(userId: string, id: string, dto: ContributionDto, kind = 'MANUAL') {
    const g = await this.goal(userId, id);
    if (dto.amount === 0) throw new ApiError(HttpStatus.BAD_REQUEST, 'montant_nul', 'Montant nul', 'amount');
    if (n(g.saved) + dto.amount < 0) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'retrait_superieur', 'Retrait supérieur à l’épargne de cet objectif', 'amount');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.goalContribution.create({ data: { goalId: id, amount: BigInt(dto.amount), kind: dto.amount < 0 ? 'WITHDRAWAL' : kind, note: dto.note } });
      return tx.savingsGoal.update({ where: { id }, data: { saved: { increment: BigInt(dto.amount) } } });
    });
    const progress = this.presentGoal(updated).progress;
    const reached = MILESTONES.filter((m) => progress >= m && m > updated.lastMilestone).pop();
    if (reached) {
      await this.prisma.savingsGoal.update({ where: { id }, data: { lastMilestone: reached } });
      await this.alert(userId, `goal${reached}:${id}`, 'goal', reached === 100 ? `Objectif atteint : ${g.name}` : `${g.name} : ${reached} %`, reached === 100 ? `Bravo ! Vous avez réuni ${n(updated.target).toLocaleString('fr-FR')} FCFA.` : `Vous avez épargné ${n(updated.saved).toLocaleString('fr-FR')} FCFA sur ${n(updated.target).toLocaleString('fr-FR')} FCFA.`);
    }
    return this.presentGoal(updated);
  }

  // ─── Alertes ───────────────────────────────────────────────────────────

  private async alert(userId: string, dedupKey: string, kind: string, title: string, body: string) {
    await this.prisma.personalAlert.createMany({ data: [{ userId, dedupKey, kind, title, body }], skipDuplicates: true });
  }

  /** Enveloppe à 80 % (seuil réglable) puis épuisée ; dépense inhabituelle. */
  private async checkAlerts(userId: string, entry: { id: string; direction: string; envelopeId: string | null; amount: bigint; label: string }) {
    if (entry.direction !== 'OUT') return;
    const w = monthWindow();
    if (entry.envelopeId) {
      const env = await this.prisma.envelope.findUnique({ where: { id: entry.envelopeId } });
      const planned = n(env?.planned);
      if (env && planned > 0) {
        const spent = n((await this.prisma.budgetEntry.aggregate({ where: { userId, envelopeId: env.id, direction: 'OUT', occurredAt: { gte: w.start, lt: w.end } }, _sum: { amount: true } }))._sum.amount);
        const pct = Math.round((spent / planned) * 100);
        const left = Math.max(0, planned - spent).toLocaleString('fr-FR');
        if (pct >= 100) await this.alert(userId, `env100:${env.id}:${w.key}`, 'budget', `Budget ${env.name} épuisé`, `Vous avez dépensé ${spent.toLocaleString('fr-FR')} FCFA sur ${planned.toLocaleString('fr-FR')} FCFA ce mois-ci.`);
        else if (pct >= env.alertThreshold) await this.alert(userId, `env${env.alertThreshold}:${env.id}:${w.key}`, 'budget', `Budget ${env.name}`, `Il vous reste ${left} FCFA sur ${planned.toLocaleString('fr-FR')} FCFA. Vous avez utilisé ${pct} % de votre budget.`);
      }
    }
    // Inhabituelle : plus de 3 fois la dépense moyenne des 30 derniers jours, et au moins 10 000 F.
    const since = new Date(Date.now() - 30 * 86_400_000);
    const avg = await this.prisma.budgetEntry.aggregate({ where: { userId, direction: 'OUT', occurredAt: { gte: since }, NOT: { id: entry.id } }, _avg: { amount: true }, _count: { _all: true } });
    const amount = n(entry.amount);
    if (avg._count._all >= 5 && amount >= 10_000 && amount > 3 * Number(avg._avg.amount ?? 0)) {
      await this.alert(userId, `unusual:${entry.id}`, 'unusual', 'Dépense inhabituelle', `${entry.label} : ${amount.toLocaleString('fr-FR')} FCFA, bien plus que vos dépenses habituelles.`);
    }
  }

  async alerts(userId: string) {
    const rows = await this.prisma.personalAlert.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { data: rows.map((a) => ({ id: a.id, kind: a.kind, title: a.title, body: a.body, read: !!a.readAt, created_at: a.createdAt })) };
  }

  async readAlerts(userId: string, id?: string) {
    await this.prisma.personalAlert.updateMany({ where: { userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
    return { ok: true };
  }

  // ─── Rapport mensuel ───────────────────────────────────────────────────

  async report(userId: string, month?: string) {
    await this.profile(userId);
    const w = monthWindow(month);
    const range = { gte: w.start, lt: w.end };
    const [byDir, byCat, saved, sent, received] = await Promise.all([
      this.prisma.budgetEntry.groupBy({ by: ['direction'], where: { userId, occurredAt: range }, _sum: { amount: true } }),
      this.prisma.budgetEntry.groupBy({ by: ['category'], where: { userId, direction: 'OUT', occurredAt: range }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } } }),
      this.prisma.goalContribution.aggregate({ where: { goal: { userId }, createdAt: range }, _sum: { amount: true } }),
      this.prisma.personalTransfer.aggregate({ where: { senderUserId: userId, status: { in: ['DECLARED', 'CONFIRMED'] }, createdAt: range }, _sum: { amount: true } }),
      this.prisma.personalTransfer.aggregate({ where: { receiverUserId: userId, status: 'CONFIRMED', createdAt: range }, _sum: { amount: true } }),
    ]);
    const top = byCat.map((c) => ({ category: c.category, category_name: categoryName(c.category), amount: n(c._sum.amount) })).filter((c) => c.amount > 0);
    // Conseil : réduire de 15 % la plus grosse dépense non essentielle du mois.
    const flexible = top.find((c) => ['transport', 'leisure', 'online', 'food'].includes(c.category));
    const advice = flexible
      ? { category: flexible.category, saving: Math.round((flexible.amount * 0.15) / 500) * 500, text: `Vous pouvez économiser environ ${(Math.round((flexible.amount * 0.15) / 500) * 500).toLocaleString('fr-FR')} FCFA par mois en réduisant vos dépenses « ${flexible.category_name} » de 15 %.` }
      : null;
    return {
      month: w.key,
      income: n(byDir.find((d) => d.direction === 'IN')?._sum.amount),
      spent: n(byDir.find((d) => d.direction === 'OUT')?._sum.amount),
      saved: n(saved._sum.amount),
      alphapay_sent: n(sent._sum.amount),
      alphapay_received: n(received._sum.amount),
      top_categories: top.slice(0, 3),
      advice,
    };
  }

  // ─── AlphaPay : annuaire, envois, demandes ─────────────────────────────

  /** Bénéficiaire par identifiant (@nom.alphapay) ou numéro ; affiché avant toute confirmation. */
  async lookup(userId: string, to: string) {
    const raw = to.trim().toLowerCase();
    let found: { userId: string; handle: string; user: AppUser } | null = null;
    if (/^[+\d][\d\s]{6,}$/.test(raw)) {
      let phone: string;
      try {
        phone = toE164(raw);
      } catch {
        throw new ApiError(HttpStatus.BAD_REQUEST, 'telephone_invalide', 'Numéro invalide', 'to');
      }
      const user = await this.prisma.appUser.findUnique({ where: { phoneHash: b(deterministicHash(phone)) }, include: { personal: true } });
      found = user?.personal ? { userId: user.id, handle: user.personal.handle, user } : null;
    } else {
      const handle = raw.replace(/^alphapay:/, '').replace(/^@/, '').replace(HANDLE_SUFFIX, '');
      const p = await this.prisma.personalProfile.findUnique({ where: { handle }, include: { user: true } });
      found = p ? { userId: p.userId, handle: p.handle, user: p.user } : null;
    }
    const profile = found;
    if (!profile || !profile.user || profile.user.status !== 'ACTIVE') throw new ApiError(HttpStatus.NOT_FOUND, 'beneficiaire_introuvable', 'Aucun utilisateur AlphaPay avec cet identifiant ou ce numéro', 'to');
    if (profile.userId === userId) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'envoi_a_soi_meme', 'Vous ne pouvez pas vous envoyer de l’argent', 'to');
    return { user_id: profile.userId, alphapay_id: displayHandle(profile.handle), name: profile.user.fullName ?? displayHandle(profile.handle), phone_masked: profile.user.phoneMasked };
  }

  /**
   * Déclare un envoi : l'argent part du MoMo de l'expéditeur vers celui du bénéficiaire,
   * hors AlphaPay. La réponse donne le numéro à utiliser dans MoMo ; le bénéficiaire
   * confirme la réception (ou conteste). Idempotent par clé.
   */
  async declareTransfer(userId: string, dto: TransferDto, idempotencyKey: string) {
    await this.profile(userId);
    if (!idempotencyKey || idempotencyKey.length > 100) throw new ApiError(HttpStatus.BAD_REQUEST, 'idempotency_key_requise', 'En-tête Idempotency-Key requis');
    const previous = await this.prisma.personalTransfer.findUnique({ where: { senderUserId_idempotencyKey: { senderUserId: userId, idempotencyKey } } });
    if (previous) return this.presentTransferForSender(previous);

    const to = await this.lookup(userId, dto.to);
    if (dto.envelope_id) await this.envelope(userId, dto.envelope_id);
    let request = null;
    if (dto.request_code) {
      request = await this.prisma.paymentRequest.findUnique({ where: { code: dto.request_code } });
      if (!request || request.requesterUserId !== to.user_id || request.status !== 'OPEN' || request.expiresAt < new Date()) {
        throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'demande_invalide', 'Cette demande de paiement n’est plus valable', 'request_code');
      }
      if (n(request.amount) !== dto.amount) throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'montant_different', 'Le montant doit être celui de la demande', 'amount');
    }
    const envelopeId = dto.envelope_id ?? (await this.prisma.envelope.findFirst({ where: { userId, key: 'transfers', archivedAt: null }, select: { id: true } }))?.id ?? null;
    const transfer = await this.prisma.$transaction(async (tx) => {
      const t = await tx.personalTransfer.create({ data: { senderUserId: userId, receiverUserId: to.user_id, amount: BigInt(dto.amount), note: dto.note, idempotencyKey, senderEnvelopeId: envelopeId, requestId: request?.id } });
      await tx.budgetEntry.create({
        data: { userId, direction: 'OUT', amount: BigInt(dto.amount), category: 'transfers', envelopeId, label: `Envoi à ${to.alphapay_id}`, note: dto.note, source: 'ALPHAPAY_TRANSFER', sourceRef: `out:${t.id}` },
      });
      if (request) await tx.paymentRequest.update({ where: { id: request.id }, data: { status: 'PAID' } });
      return t;
    });
    const sender = await this.prisma.personalProfile.findUniqueOrThrow({ where: { userId }, include: { user: true } });
    await this.alert(to.user_id, `transfer_in:${transfer.id}`, 'transfer', `${sender.user.fullName ?? displayHandle(sender.handle)} vous a envoyé ${dto.amount.toLocaleString('fr-FR')} FCFA`, 'Vérifiez votre MoMo, puis confirmez la réception dans AlphaPay.');
    return this.presentTransferForSender(transfer);
  }

  private async presentTransferForSender(t: { id: string; receiverUserId: string; amount: bigint; note: string | null; status: string; createdAt: Date }) {
    const receiver = await this.prisma.appUser.findUniqueOrThrow({ where: { id: t.receiverUserId }, include: { personal: true } });
    const phone = receiver.phoneEncrypted ? decryptField(receiver.phoneEncrypted as unknown as Buffer) : null;
    return {
      id: t.id,
      status: t.status.toLowerCase(),
      amount: n(t.amount),
      fee: 0,
      note: t.note,
      to: { alphapay_id: receiver.personal ? displayHandle(receiver.personal.handle) : null, name: receiver.fullName },
      // Numéro MoMo du bénéficiaire : l'envoi se fait depuis le MoMo de l'expéditeur.
      momo_number: t.status === 'DECLARED' ? phone : null,
      created_at: t.createdAt,
    };
  }

  async transfers(userId: string) {
    const rows = await this.prisma.personalTransfer.findMany({ where: { OR: [{ senderUserId: userId }, { receiverUserId: userId }] }, orderBy: { createdAt: 'desc' }, take: 50 });
    const ids = [...new Set(rows.flatMap((r) => [r.senderUserId, r.receiverUserId]))];
    const people = await this.prisma.appUser.findMany({ where: { id: { in: ids } }, include: { personal: true } });
    const who = (id: string) => {
      const p = people.find((x) => x.id === id);
      return { alphapay_id: p?.personal ? displayHandle(p.personal.handle) : null, name: p?.fullName ?? null };
    };
    return {
      data: rows.map((t) => ({
        id: t.id,
        direction: t.senderUserId === userId ? 'sent' : 'received',
        status: t.status.toLowerCase(),
        amount: n(t.amount),
        note: t.note,
        counterpart: who(t.senderUserId === userId ? t.receiverUserId : t.senderUserId),
        created_at: t.createdAt,
        confirmed_at: t.confirmedAt,
      })),
    };
  }

  /** Le bénéficiaire confirme avoir reçu l'argent sur son MoMo : l'entrée arrive dans son budget. */
  async confirmTransfer(userId: string, id: string) {
    const t = await this.prisma.personalTransfer.findFirst({ where: { id, receiverUserId: userId } });
    if (!t) throw new ApiError(HttpStatus.NOT_FOUND, 'envoi_introuvable', 'Envoi introuvable', 'id');
    if (t.status !== 'DECLARED') throw new ApiError(HttpStatus.CONFLICT, 'envoi_deja_traite', 'Cet envoi a déjà été traité');
    const sender = await this.prisma.personalProfile.findUniqueOrThrow({ where: { userId: t.senderUserId }, include: { user: true } });
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.personalTransfer.updateMany({ where: { id, status: 'DECLARED' }, data: { status: 'CONFIRMED', confirmedAt: new Date() } });
      if (r.count !== 1) throw new ApiError(HttpStatus.CONFLICT, 'envoi_deja_traite', 'Cet envoi a déjà été traité');
      await tx.budgetEntry.create({
        data: { userId, direction: 'IN', amount: t.amount, category: 'transfer_in', label: `Reçu de ${displayHandle(sender.handle)}`, note: t.note, source: 'ALPHAPAY_TRANSFER', sourceRef: `in:${t.id}` },
      });
    });
    await this.alert(t.senderUserId, `transfer_ok:${t.id}`, 'transfer', 'Envoi confirmé', `Votre envoi de ${n(t.amount).toLocaleString('fr-FR')} FCFA a bien été reçu.`);
    return { id, status: 'confirmed' };
  }

  /** Le bénéficiaire n'a rien reçu : l'envoi est contesté, l'expéditeur prévenu. */
  async disputeTransfer(userId: string, id: string) {
    const t = await this.prisma.personalTransfer.findFirst({ where: { id, receiverUserId: userId, status: 'DECLARED' } });
    if (!t) throw new ApiError(HttpStatus.NOT_FOUND, 'envoi_introuvable', 'Envoi introuvable ou déjà traité', 'id');
    await this.prisma.personalTransfer.update({ where: { id }, data: { status: 'DISPUTED' } });
    await this.alert(t.senderUserId, `transfer_ko:${t.id}`, 'transfer', 'Envoi non reçu', `Le bénéficiaire indique ne pas avoir reçu ${n(t.amount).toLocaleString('fr-FR')} FCFA. Vérifiez votre historique MoMo.`);
    return { id, status: 'disputed' };
  }

  /** L'expéditeur annule un envoi non encore confirmé (MoMo non effectué) : la dépense disparaît. */
  async cancelTransfer(userId: string, id: string) {
    const t = await this.prisma.personalTransfer.findFirst({ where: { id, senderUserId: userId, status: { in: ['DECLARED', 'DISPUTED'] } } });
    if (!t) throw new ApiError(HttpStatus.NOT_FOUND, 'envoi_introuvable', 'Envoi introuvable ou déjà confirmé', 'id');
    await this.prisma.$transaction([
      this.prisma.personalTransfer.update({ where: { id }, data: { status: 'CANCELLED' } }),
      this.prisma.budgetEntry.deleteMany({ where: { userId, source: 'ALPHAPAY_TRANSFER', sourceRef: `out:${id}` } }),
      ...(t.requestId ? [this.prisma.paymentRequest.update({ where: { id: t.requestId }, data: { status: 'OPEN' } })] : []),
    ]);
    return { id, status: 'cancelled' };
  }

  async createRequest(userId: string, dto: PaymentRequestDto) {
    const p = await this.profile(userId);
    const r = await this.prisma.paymentRequest.create({
      data: { requesterUserId: userId, amount: BigInt(dto.amount), reason: dto.reason.trim(), code: randomBytes(5).toString('hex'), expiresAt: new Date(Date.now() + (dto.ttl_hours ?? 24) * 3_600_000) },
    });
    return this.presentRequest(r, p.handle);
  }

  private presentRequest(r: { id: string; code: string; amount: bigint; reason: string; status: string; expiresAt: Date; createdAt: Date }, handle: string) {
    const expired = r.status === 'OPEN' && r.expiresAt < new Date();
    return {
      id: r.id,
      code: r.code,
      from: displayHandle(handle),
      amount: n(r.amount),
      reason: r.reason,
      status: expired ? 'expired' : r.status.toLowerCase(),
      expires_at: r.expiresAt,
      created_at: r.createdAt,
      qr_payload: `alphapay:${displayHandle(handle)}?request=${r.code}`,
    };
  }

  async myRequests(userId: string) {
    const p = await this.profile(userId);
    const rows = await this.prisma.paymentRequest.findMany({ where: { requesterUserId: userId }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { data: rows.map((r) => this.presentRequest(r, p.handle)) };
  }

  async request(code: string) {
    const r = await this.prisma.paymentRequest.findUnique({ where: { code } });
    if (!r) throw new ApiError(HttpStatus.NOT_FOUND, 'demande_introuvable', 'Demande introuvable', 'code');
    const p = await this.prisma.personalProfile.findUniqueOrThrow({ where: { userId: r.requesterUserId } });
    return this.presentRequest(r, p.handle);
  }

  async cancelRequest(userId: string, id: string) {
    const r = await this.prisma.paymentRequest.updateMany({ where: { id, requesterUserId: userId, status: 'OPEN' }, data: { status: 'CANCELLED' } });
    if (!r.count) throw new ApiError(HttpStatus.NOT_FOUND, 'demande_introuvable', 'Demande introuvable ou déjà réglée', 'id');
    return { id, status: 'cancelled' };
  }
}
