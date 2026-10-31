import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@paybrain/database';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { checkoutUrl, newPublicCode } from '../../common/codes/public-code';
import { BillingService } from '../billing/billing.service';
import { QrFormat, renderTillQrPdf } from './till-qr.pdf';
import { can, MemberRole } from '../team/permissions/permissions';

export interface Actor {
  userId: string;
  memberId: string;
  role: MemberRole;
  ip?: string;
}

const TILL_SELECT = {
  id: true,
  storeId: true,
  name: true,
  publicCode: true,
  active: true,
  confirmBySms: true,
  confirmByWhatsApp: true,
  createdAt: true,
  members: { select: { member: { select: { id: true, role: true, user: { select: { fullName: true, phoneMasked: true } } } } } },
} satisfies Prisma.TillSelect;

/**
 * Structure du marchand (§M6, T-50) : boutiques → caisses → caissiers.
 * Les identifiants viennent toujours de la route (`:merchantId`) et sont
 * revérifiés : une boutique ou une caisse d'un autre marchand est introuvable.
 */
@Injectable()
export class StoresService {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  private notFound(what = 'Boutique') {
    return new ApiError(HttpStatus.NOT_FOUND, 'introuvable', `${what} introuvable`);
  }

  private async record(actor: Actor, merchantId: string, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    await this.audit.record({ actorType: 'user', actorId: actor.userId, merchantId, action, targetType, targetId, ip: actor.ip, metadata });
  }

  private mapTill(t: Prisma.TillGetPayload<{ select: typeof TILL_SELECT }>) {
    return {
      ...t,
      members: t.members.map((m) => ({ memberId: m.member.id, role: m.member.role, fullName: m.member.user.fullName, phone: m.member.user.phoneMasked })),
    };
  }

  async listStores(merchantId: string) {
    const stores = await this.prisma.store.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      include: { tills: { select: TILL_SELECT, orderBy: { createdAt: 'asc' } } },
    });
    return stores.map((s) => ({ ...s, tills: s.tills.map((t) => this.mapTill(t)) }));
  }

  /** Limites du palier (§M11) : nombre de boutiques et de caisses. */
  private async checkLimit(merchantId: string, kind: 'stores' | 'tills') {
    const current = kind === 'stores' ? await this.prisma.store.count({ where: { merchantId, active: true } }) : await this.prisma.till.count({ where: { merchantId, active: true } });
    await this.billing.assertWithinLimit(merchantId, kind, current);
  }

  async createStore(merchantId: string, input: { name: string; address?: string }, actor: Actor) {
    await this.checkLimit(merchantId, 'stores');
    const store = await this.prisma.store.create({ data: { merchantId, name: input.name.trim(), address: input.address?.trim() || null } });
    await this.record(actor, merchantId, 'stores.store_created', 'store', store.id);
    return store;
  }

  async updateStore(merchantId: string, storeId: string, input: { name?: string; address?: string; active?: boolean }, actor: Actor) {
    const res = await this.prisma.store.updateMany({
      where: { id: storeId, merchantId },
      data: { name: input.name?.trim(), address: input.address === undefined ? undefined : input.address.trim() || null, active: input.active },
    });
    if (res.count === 0) throw this.notFound();
    await this.record(actor, merchantId, 'stores.store_updated', 'store', storeId, { active: input.active });
    return this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  }

  async createTill(merchantId: string, storeId: string, input: { name: string }, actor: Actor) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw this.notFound();
    await this.checkLimit(merchantId, 'tills');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const till = await this.prisma.till.create({
          data: { merchantId, storeId, name: input.name.trim(), publicCode: newPublicCode() },
          select: TILL_SELECT,
        });
        await this.record(actor, merchantId, 'stores.till_created', 'till', till.id);
        return this.mapTill(till);
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err; // collision de code public : on retire
      }
    }
    throw new Error('Impossible de générer un code de caisse unique');
  }

  async updateTill(
    merchantId: string,
    tillId: string,
    input: { name?: string; active?: boolean; confirmBySms?: boolean; confirmByWhatsApp?: boolean },
    actor: Actor,
  ) {
    const res = await this.prisma.till.updateMany({
      where: { id: tillId, merchantId },
      data: { name: input.name?.trim(), active: input.active, confirmBySms: input.confirmBySms, confirmByWhatsApp: input.confirmByWhatsApp },
    });
    if (res.count === 0) throw this.notFound('Caisse');
    await this.record(actor, merchantId, 'stores.till_updated', 'till', tillId, { ...input, name: undefined });
    return this.mapTill(await this.prisma.till.findUniqueOrThrow({ where: { id: tillId }, select: TILL_SELECT }));
  }

  /** Rattache un membre actif du marchand à une caisse (idempotent). */
  async assignMember(merchantId: string, tillId: string, memberId: string, actor: Actor) {
    const [till, member] = await Promise.all([
      this.prisma.till.findFirst({ where: { id: tillId, merchantId } }),
      this.prisma.merchantMember.findFirst({ where: { id: memberId, merchantId, status: 'ACTIVE' } }),
    ]);
    if (!till) throw this.notFound('Caisse');
    if (!member) throw this.notFound('Membre');
    await this.prisma.tillMember.upsert({
      where: { tillId_memberId: { tillId, memberId } },
      create: { tillId, memberId },
      update: {},
    });
    await this.record(actor, merchantId, 'team.member_assigned_to_till', 'till', tillId, { memberId });
    return this.mapTill(await this.prisma.till.findUniqueOrThrow({ where: { id: tillId }, select: TILL_SELECT }));
  }

  async unassignMember(merchantId: string, tillId: string, memberId: string, actor: Actor) {
    const till = await this.prisma.till.findFirst({ where: { id: tillId, merchantId } });
    if (!till) throw this.notFound('Caisse');
    await this.prisma.tillMember.deleteMany({ where: { tillId, memberId } });
    await this.record(actor, merchantId, 'team.member_unassigned_from_till', 'till', tillId, { memberId });
    return this.mapTill(await this.prisma.till.findUniqueOrThrow({ where: { id: tillId }, select: TILL_SELECT }));
  }

  /**
   * Caisses visibles par un membre : toutes pour qui voit tous les paiements,
   * sinon seulement celles auxquelles il est rattaché (caissier).
   */
  async visibleTillIds(merchantId: string, actor: Pick<Actor, 'memberId' | 'role'>): Promise<string[] | 'all'> {
    if (can(actor.role, 'payments:view')) return 'all';
    if (!can(actor.role, 'payments:view_own_till')) return [];
    const rows = await this.prisma.tillMember.findMany({
      where: { memberId: actor.memberId, till: { merchantId, active: true } },
      select: { tillId: true },
    });
    return rows.map((r) => r.tillId);
  }

  /** PDF imprimable du QR de la caisse (T-54) ; la génération est auditée. */
  async tillQrPdf(merchantId: string, tillId: string, format: QrFormat, actor: Actor): Promise<{ filename: string; pdf: Buffer }> {
    const till = await this.prisma.till.findFirst({
      where: { id: tillId, merchantId },
      include: { store: { select: { name: true, merchant: { select: { name: true } } } } },
    });
    if (!till) throw this.notFound('Caisse');
    const pdf = await renderTillQrPdf(
      { merchantName: till.store.merchant.name, storeName: till.store.name, tillName: till.name, code: till.publicCode, url: checkoutUrl('c', till.publicCode) },
      format,
    );
    await this.record(actor, merchantId, 'stores.qr_generated', 'till', till.id, { format });
    return { filename: `qr-${till.publicCode}-${format.toLowerCase()}.pdf`, pdf };
  }

  async myTills(merchantId: string, actor: Pick<Actor, 'memberId' | 'role'>) {
    const visible = await this.visibleTillIds(merchantId, actor);
    const tills = await this.prisma.till.findMany({
      where: { merchantId, active: true, ...(visible === 'all' ? {} : { id: { in: visible } }) },
      select: { ...TILL_SELECT, store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // url : adresse encodée dans le QR de la caisse (affiché par l'app mobile).
    return tills.map(({ store, ...t }) => ({ ...this.mapTill(t), store, url: checkoutUrl('c', t.publicCode) }));
  }
}
