import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { KybApplication, KybDocumentType, KybStatus, KycCheckStatus, OnboardingStatus, Prisma, PrismaClient } from '@paybrain/database';
import { KycDecision, KycProvider, ProviderError } from '@paybrain/providers';
import { createHash, randomUUID } from 'crypto';
import { AuditService } from '../../common/audit/audit.service';
import { ApiError } from '../../common/errors/api-error';
import { decryptFile, encryptFile, FileStorage } from '../../common/storage/file-storage';
import { decryptField } from '../../common/security/pii-crypto';
import { MessagingService } from '../messaging/messaging.service';
import { signedFileUrl } from '../providers/callback-token';

export const KYC_PROVIDER = Symbol('KYC_PROVIDER');

/** Libellés publics des états (§M2). */
export const KYB_STATUS_LABEL: Record<KybStatus, string> = {
  DRAFT: 'brouillon',
  SUBMITTED: 'soumis',
  IN_REVIEW: 'en_revue',
  APPROVED: 'approuvé',
  INFO_REQUIRED: 'infos_requises',
  REJECTED: 'refusé',
};

const KYC_LABEL: Record<KycCheckStatus, string> = { PENDING: 'en_attente', APPROVED: 'approuvé', REJECTED: 'refusé', RETRY: 'à_reprendre' };

const STATUS_MESSAGE: Partial<Record<KybStatus, string>> = {
  SUBMITTED: 'Votre dossier a bien été soumis. L’équipe AlphaPay va l’examiner.',
  IN_REVIEW: 'Votre dossier est en cours d’examen par l’équipe AlphaPay.',
  APPROVED: 'Votre dossier est approuvé : le mode live est ouvert.',
  INFO_REQUIRED: 'L’équipe AlphaPay a besoin de compléments pour votre dossier.',
  REJECTED: 'Votre dossier n’a pas été retenu.',
};

/** Transitions autorisées (§M2). */
const TRANSITIONS: Record<KybStatus, KybStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'INFO_REQUIRED', 'REJECTED'],
  INFO_REQUIRED: ['SUBMITTED'],
  APPROVED: [],
  REJECTED: [],
};

const EDITABLE: KybStatus[] = ['DRAFT', 'INFO_REQUIRED'];
const REQUIRED_FIELDS = ['legalName', 'legalForm', 'rccm', 'niu', 'address', 'sector', 'directorFirstName', 'directorLastName'] as const;
export const REQUIRED_DOCUMENTS: KybDocumentType[] = ['RCCM_EXTRACT', 'NIU_CERTIFICATE', 'DIRECTOR_ID'];

export const ALLOWED_FILE_TYPES: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type KybFields = Partial<Pick<KybApplication, (typeof REQUIRED_FIELDS)[number]>>;

/** Qui agit : un membre du marchand, un agent AlphaPay ou le système (webhook KYC). */
export interface KybActor {
  type: 'user' | 'staff' | 'system';
  id?: string;
  ip?: string;
}

/** Vérifie le format réel du fichier (signature binaire), pas seulement le type annoncé. */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/**
 * Dossier KYB et KYC du dirigeant (T-59, T-60, §M2). Seul un dossier approuvé
 * ouvre le mode live (Merchant.onboardingStatus, lu par les gardes « live »).
 * Chaque changement d'état est horodaté, attribué, audité et notifié au marchand.
 */
@Injectable()
export class KybService {
  private readonly logger = new Logger(KybService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    @Inject(KYC_PROVIDER) private readonly kyc: KycProvider,
    private readonly storage: FileStorage,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  get kycProvider(): KycProvider {
    return this.kyc;
  }

  // ─── Côté marchand ───────────────────────────────────────────────────────

  /** Dossier du marchand (créé au premier accès, à l'état brouillon). */
  async forMerchant(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { name: true } });
    return this.prisma.kybApplication.upsert({
      where: { merchantId },
      create: { merchantId, legalName: merchant?.name },
      update: {},
    });
  }

  async view(merchantId: string) {
    const app = await this.forMerchant(merchantId);
    return this.present(app.id);
  }

  async update(merchantId: string, fields: KybFields, actor: KybActor) {
    const app = await this.forMerchant(merchantId);
    this.assertEditable(app);
    const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    await this.prisma.kybApplication.update({ where: { id: app.id }, data });
    await this.record(actor, merchantId, 'kyb.application_updated', app.id, { fields: Object.keys(data) });
    return this.present(app.id);
  }

  async uploadDocument(merchantId: string, type: KybDocumentType, file: { buffer: Buffer; originalname: string; mimetype: string; size: number }, actor: KybActor) {
    if (!REQUIRED_DOCUMENTS.includes(type)) throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', 'Type de pièce inconnu', 'type');
    if (!file?.buffer?.length) throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', 'Fichier manquant', 'file');
    if (file.size > MAX_FILE_BYTES) throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'fichier_trop_volumineux', 'Fichier limité à 10 Mo', 'file');
    const real = sniff(file.buffer);
    if (!real || !ALLOWED_FILE_TYPES[real]) throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'format_non_supporte', 'Formats acceptés : PDF, JPEG, PNG', 'file');

    const app = await this.forMerchant(merchantId);
    this.assertEditable(app);
    const storageKey = `kyb/${merchantId}/${type.toLowerCase()}/${randomUUID()}.bin`;
    await this.storage.put(storageKey, encryptFile(file.buffer));
    const previous = await this.prisma.kybDocument.findUnique({ where: { applicationId_type: { applicationId: app.id, type } } });
    const doc = await this.prisma.kybDocument.upsert({
      where: { applicationId_type: { applicationId: app.id, type } },
      create: { applicationId: app.id, type, storageKey, ...this.fileMeta(file, real) },
      update: { storageKey, ...this.fileMeta(file, real), createdAt: new Date() },
    });
    if (previous) await this.storage.delete(previous.storageKey).catch(() => undefined);
    await this.record(actor, merchantId, 'kyb.document_uploaded', doc.id, { type, replaced: !!previous });
    return this.present(app.id);
  }

  private fileMeta(file: { buffer: Buffer; originalname: string; size: number }, contentType: string) {
    // Nom affiché seulement : jamais utilisé comme chemin.
    const filename = (file.originalname || 'piece').replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 120);
    return { filename, contentType, sizeBytes: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex') };
  }

  /** URL signée et temporaire d'une pièce (5 min) ; la consultation est auditée. */
  async documentUrl(applicationId: string, documentId: string, actor: KybActor, merchantId?: string) {
    const doc = await this.prisma.kybDocument.findFirst({
      where: { id: documentId, applicationId, ...(merchantId ? { application: { merchantId } } : {}) },
      include: { application: { select: { merchantId: true } } },
    });
    if (!doc) throw new ApiError(HttpStatus.NOT_FOUND, 'introuvable', 'Pièce introuvable');
    await this.record(actor, doc.application.merchantId, 'kyb.document_viewed', doc.id, { type: doc.type });
    const { url, expiresAt } = signedFileUrl(doc.id);
    return { url, expires_at: expiresAt };
  }

  /** Contenu déchiffré d'une pièce (route signée /v1/files/:id). */
  async readDocument(documentId: string) {
    const doc = await this.prisma.kybDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new ApiError(HttpStatus.NOT_FOUND, 'introuvable', 'Fichier introuvable');
    return { doc, content: decryptFile(await this.storage.get(doc.storageKey)) };
  }

  /** Lance (ou reprend) la vérification d'identité du dirigeant : lien du fournisseur KYC. */
  async startKyc(merchantId: string, actor: KybActor) {
    const app = await this.forMerchant(merchantId);
    if (!app.directorFirstName || !app.directorLastName) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'dirigeant_incomplet', 'Renseignez le nom du dirigeant avant la vérification d’identité');
    }
    if (app.status === 'APPROVED' || app.status === 'REJECTED') throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'dossier_clos', 'Ce dossier est clos');

    let check = await this.prisma.kycCheck.findFirst({ where: { applicationId: app.id, provider: this.kyc.name }, orderBy: { createdAt: 'desc' } });
    if (check?.status === 'APPROVED') throw new ApiError(HttpStatus.CONFLICT, 'kyc_deja_approuve', 'L’identité du dirigeant est déjà vérifiée');
    // Un refus définitif impose un nouveau demandeur ; en attente ou à reprendre, on reprend le même.
    if (!check || check.status === 'REJECTED') {
      const owner = await this.ownerContact(merchantId);
      const { applicantId } = await this.kyc.createApplicant({
        externalId: app.id,
        firstName: app.directorFirstName,
        lastName: app.directorLastName,
        email: owner?.email,
        phone: owner?.phone,
      });
      check = await this.prisma.kycCheck.create({ data: { applicationId: app.id, provider: this.kyc.name, applicantId } });
      await this.record(actor, merchantId, 'kyb.kyc_started', check.id, { provider: this.kyc.name });
    }
    const link = await this.kyc.createVerificationLink(check.applicantId, { ttlSeconds: 1800, locale: 'fr' });
    return { url: link.url, expires_at: link.expiresAt, kyc: { status: KYC_LABEL[check.status] } };
  }

  async submit(merchantId: string, actor: KybActor) {
    const app = await this.forMerchant(merchantId);
    const missing = await this.missing(app);
    if (missing.length) {
      throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'dossier_incomplet', `Dossier incomplet : ${missing.join(', ')}`);
    }
    await this.transition(app, 'SUBMITTED', actor);
    await this.prisma.kybApplication.update({ where: { id: app.id }, data: { submittedAt: new Date() } });
    return this.present(app.id);
  }

  // ─── Côté AlphaPay (back-office) ─────────────────────────────────────────

  async queue(status?: KybStatus) {
    const rows = await this.prisma.kybApplication.findMany({
      where: { status: status ?? { in: ['SUBMITTED', 'IN_REVIEW'] } },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: 200,
      include: { merchant: { select: { name: true } }, kycChecks: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    return {
      data: rows.map((a) => ({
        id: a.id,
        merchant_id: a.merchantId,
        merchant_name: a.merchant.name,
        legal_name: a.legalName,
        status: KYB_STATUS_LABEL[a.status],
        kyc: a.kycChecks[0] ? KYC_LABEL[a.kycChecks[0].status] : null,
        submitted_at: a.submittedAt,
      })),
    };
  }

  async staffView(id: string) {
    return this.present(id, { staff: true });
  }

  async takeForReview(id: string, actor: KybActor) {
    const app = await this.prisma.kybApplication.findUnique({ where: { id } });
    if (!app) throw new ApiError(HttpStatus.NOT_FOUND, 'introuvable', 'Dossier introuvable');
    await this.transition(app, 'IN_REVIEW', actor);
    return this.present(id, { staff: true });
  }

  /**
   * Décision (§M2) : approuver, demander des compléments ou refuser, avec motif
   * (obligatoire hors approbation). Un dossier soumis passe d'abord en revue.
   * L'approbation exige un KYC approuvé, sauf dérogation motivée (sans contrat
   * Sumsub : pièces vérifiées manuellement, §13).
   */
  async decide(id: string, decision: 'approve' | 'request_info' | 'reject', actor: KybActor, reason?: string, kycOverride = false) {
    let app = await this.prisma.kybApplication.findUnique({ where: { id } });
    if (!app) throw new ApiError(HttpStatus.NOT_FOUND, 'introuvable', 'Dossier introuvable');
    const text = reason?.trim();
    if (decision !== 'approve' && !text) throw new ApiError(HttpStatus.BAD_REQUEST, 'motif_requis', 'Un motif est obligatoire', 'reason');
    if (decision === 'approve') {
      const kyc = await this.prisma.kycCheck.findFirst({ where: { applicationId: id }, orderBy: { createdAt: 'desc' } });
      if (kyc?.status !== 'APPROVED' && !(kycOverride && text)) {
        throw new ApiError(HttpStatus.UNPROCESSABLE_ENTITY, 'kyc_non_approuve', 'Identité du dirigeant non vérifiée : dérogation motivée requise', 'kyc_override');
      }
    }
    if (app.status === 'SUBMITTED') app = await this.transition(app, 'IN_REVIEW', actor);
    const target: KybStatus = decision === 'approve' ? 'APPROVED' : decision === 'reject' ? 'REJECTED' : 'INFO_REQUIRED';
    await this.transition(app, target, actor, text, { kycOverride: decision === 'approve' && kycOverride });
    return this.present(id, { staff: true });
  }

  // ─── KYC : webhook du fournisseur ────────────────────────────────────────

  /**
   * Webhook KYC : la signature est vérifiée par l'adaptateur, puis le résultat
   * est RELU auprès du fournisseur (le corps n'est qu'un déclencheur, D-021).
   */
  async handleKycWebhook(req: { headers: any; body: unknown; rawBody?: string }) {
    let event;
    try {
      event = this.kyc.parseWebhook(req);
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'invalid_signature') throw new ApiError(HttpStatus.UNAUTHORIZED, 'signature_invalide', 'Signature invalide');
      throw err;
    }
    if (!event) return { ignored: true };
    const check = await this.prisma.kycCheck.findUnique({ where: { provider_applicantId: { provider: this.kyc.name, applicantId: event.applicantId } } });
    if (!check) return { ignored: true };
    const result = await this.kyc.getResult(event.applicantId);
    const status = (({ pending: 'PENDING', approved: 'APPROVED', rejected: 'REJECTED', retry: 'RETRY' }) as Record<KycDecision, KycCheckStatus>)[result.decision];
    if (status === check.status) return { ok: true, unchanged: true };
    await this.prisma.kycCheck.update({
      where: { id: check.id },
      data: { status, reasons: result.reasons ?? [], completedAt: status === 'PENDING' ? null : new Date() },
    });
    const app = await this.prisma.kybApplication.findUniqueOrThrow({ where: { id: check.applicationId } });
    await this.record({ type: 'system' }, app.merchantId, 'kyb.kyc_result', check.id, { status: KYC_LABEL[status], reasons: result.reasons ?? [] });
    return { ok: true, status: KYC_LABEL[status] };
  }

  // ─── Interne ─────────────────────────────────────────────────────────────

  private assertEditable(app: KybApplication) {
    if (!EDITABLE.includes(app.status)) {
      throw new ApiError(HttpStatus.CONFLICT, 'dossier_verrouille', `Dossier ${KYB_STATUS_LABEL[app.status]} : modification impossible`);
    }
  }

  private async missing(app: KybApplication): Promise<string[]> {
    const docs = await this.prisma.kybDocument.findMany({ where: { applicationId: app.id }, select: { type: true } });
    const have = new Set(docs.map((d) => d.type));
    return [
      ...REQUIRED_FIELDS.filter((f) => !app[f]?.toString().trim()),
      ...REQUIRED_DOCUMENTS.filter((d) => !have.has(d)),
    ];
  }

  private async transition(app: KybApplication, to: KybStatus, actor: KybActor, reason?: string, metadata: Record<string, unknown> = {}) {
    if (!TRANSITIONS[app.status].includes(to)) {
      throw new ApiError(HttpStatus.CONFLICT, 'transition_interdite', `Passage ${KYB_STATUS_LABEL[app.status]} → ${KYB_STATUS_LABEL[to]} impossible`);
    }
    const onboarding: OnboardingStatus = to === 'APPROVED' ? 'APPROVED' : to === 'REJECTED' ? 'REJECTED' : 'PENDING';
    const decided = to === 'APPROVED' || to === 'REJECTED' || to === 'INFO_REQUIRED';
    const [updated] = await this.prisma.$transaction([
      // Garde optimiste : l'état n'a pas changé entre la lecture et l'écriture.
      this.prisma.kybApplication.update({
        where: { id: app.id, status: app.status },
        data: { status: to, ...(decided ? { decidedAt: new Date(), decisionReason: reason ?? null } : {}) },
      }),
      this.prisma.kybEvent.create({
        data: { applicationId: app.id, fromStatus: app.status, toStatus: to, actorType: actor.type, actorId: actor.id ?? null, reason: reason ?? null },
      }),
      this.prisma.merchant.update({ where: { id: app.merchantId }, data: { onboardingStatus: onboarding, rejectionReason: to === 'REJECTED' ? reason ?? null : null } }),
    ]).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new ApiError(HttpStatus.CONFLICT, 'transition_interdite', 'Le dossier a changé entre-temps, rechargez-le');
      }
      throw err;
    });
    await this.record(actor, app.merchantId, 'kyb.status_changed', app.id, { from: KYB_STATUS_LABEL[app.status], to: KYB_STATUS_LABEL[to], ...metadata });
    await this.notify(app.merchantId, to, reason);
    return updated;
  }

  /** Notification au marchand à chaque changement d'état (§M2) : email, à défaut SMS. */
  private async notify(merchantId: string, status: KybStatus, reason?: string) {
    const contact = await this.ownerContact(merchantId);
    if (!contact) return;
    const text = `${STATUS_MESSAGE[status] ?? ''}${reason ? ` Motif : ${reason}` : ''}`.trim();
    await this.messaging
      .send({
        merchantId: null,
        livemode: true,
        channels: contact.email ? ['EMAIL', 'SMS'] : ['SMS'],
        to: { email: contact.email, phone: contact.phone },
        templateKey: 'kyb.statut',
        variables: { status: KYB_STATUS_LABEL[status].replace('_', ' '), text },
        category: 'TRANSACTIONAL',
      })
      .catch((err) => this.logger.warn(`KYB : notification non envoyée (${(err as Error).message})`));
  }

  private async ownerContact(merchantId: string): Promise<{ email?: string; phone?: string } | null> {
    const owner = await this.prisma.merchantMember.findFirst({
      where: { merchantId, role: 'OWNER', status: 'ACTIVE' },
      select: { user: { select: { emailEncrypted: true, phoneEncrypted: true } } },
    });
    if (!owner) return null;
    return {
      email: owner.user.emailEncrypted ? decryptField(owner.user.emailEncrypted) : undefined,
      phone: owner.user.phoneEncrypted ? decryptField(owner.user.phoneEncrypted) : undefined,
    };
  }

  private record(actor: KybActor, merchantId: string, action: string, targetId: string, metadata?: Record<string, unknown>) {
    const actorType = actor.type === 'system' ? 'system' : actor.type === 'staff' ? 'staff' : 'user';
    return this.audit.record({ actorType, actorId: actor.id, merchantId, action, targetType: 'kyb', targetId, ip: actor.ip, metadata });
  }

  private async present(id: string, opts: { staff?: boolean } = {}) {
    const app = await this.prisma.kybApplication.findUniqueOrThrow({
      where: { id },
      include: {
        merchant: { select: { name: true } },
        documents: { orderBy: { type: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        kycChecks: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    const kyc = app.kycChecks[0];
    return {
      id: app.id,
      object: 'kyb_application',
      merchant_id: app.merchantId,
      ...(opts.staff ? { merchant_name: app.merchant.name } : {}),
      status: KYB_STATUS_LABEL[app.status],
      editable: EDITABLE.includes(app.status),
      live_enabled: app.status === 'APPROVED',
      company: {
        legal_name: app.legalName,
        legal_form: app.legalForm,
        rccm: app.rccm,
        niu: app.niu,
        address: app.address,
        sector: app.sector,
      },
      director: { first_name: app.directorFirstName, last_name: app.directorLastName },
      documents: app.documents.map((d) => ({ id: d.id, type: d.type, filename: d.filename, content_type: d.contentType, size_bytes: d.sizeBytes, uploaded_at: d.createdAt })),
      kyc: kyc ? { status: KYC_LABEL[kyc.status], provider: kyc.provider, reasons: kyc.reasons, completed_at: kyc.completedAt } : null,
      missing: await this.missing(app),
      decision_reason: app.decisionReason,
      submitted_at: app.submittedAt,
      decided_at: app.decidedAt,
      history: app.events.map((e) => ({
        from: e.fromStatus ? KYB_STATUS_LABEL[e.fromStatus] : null,
        to: KYB_STATUS_LABEL[e.toStatus],
        actor_type: e.actorType,
        ...(opts.staff ? { actor_id: e.actorId } : {}),
        reason: e.reason,
        at: e.createdAt,
      })),
    };
  }
}
