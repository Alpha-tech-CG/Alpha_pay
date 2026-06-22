import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KycDocumentType, KycStatus, PrismaClient } from '@paybrain/database';
import { KycDocumentStorageService } from './kyc-document-storage.service';
import { KycProviderService, SmileCallbackResult } from './kyc.providers';

const REQUIRED_DOCS: KycDocumentType[] = ['ID_FRONT', 'ID_BACK', 'RCCM', 'NIU', 'STATUTES', 'PROOF_OF_ADDRESS'];
const SMILE_AUTO_APPROVE = 90;
const RE_KYC_MONTHS = 12;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly providers: KycProviderService,
    private readonly storage: KycDocumentStorageService,
  ) {}

  async ensureCase(merchantId: string) {
    const existing = await this.prisma.kycCase.findUnique({ where: { merchantId } });
    if (existing) return existing;
    return this.prisma.kycCase.create({
      data: { merchantId, status: 'NOT_STARTED', events: { create: { action: 'CREATED', actor: 'system' } } },
    });
  }

  async createUploadUrl(merchantId: string, type: KycDocumentType, contentType: string) {
    const kycCase = await this.ensureCase(merchantId);
    return this.storage.createUploadUrl(merchantId, kycCase.id, type, contentType);
  }

  async addDocument(merchantId: string, type: KycDocumentType, s3Key: string) {
    const kycCase = await this.ensureCase(merchantId);
    await this.storage.verifyUploadedDocument(s3Key, merchantId, kycCase.id, type);
    await this.prisma.kycDocument.upsert({
      where: { caseId_type: { caseId: kycCase.id, type } },
      update: { s3Key, uploadedAt: new Date() },
      create: { caseId: kycCase.id, type, s3Key },
    });
    await this.event(kycCase.id, 'DOCUMENT_ADDED', 'merchant', type);
    return { caseId: kycCase.id, type, ok: true };
  }

  async submit(merchantId: string) {
    const kycCase = await this.prisma.kycCase.findUnique({ where: { merchantId }, include: { documents: true } });
    if (!kycCase) throw new NotFoundException('Dossier KYC introuvable — ajouter des documents d’abord');
    if (kycCase.status === 'APPROVED') throw new BadRequestException('Dossier déjà approuvé');
    const present = new Set(kycCase.documents.map((document) => document.type));
    const missing = REQUIRED_DOCS.filter((type) => !present.has(type));
    if (missing.length > 0) throw new BadRequestException(`Documents manquants : ${missing.join(', ')}`);
    await this.transition(kycCase.id, 'SUBMITTED', 'merchant');

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { name: true } });
    const screening = await this.providers.screenSanctions(merchant?.name ?? '');
    const smile = screening.hit
      ? undefined
      : await this.providers.startSmileVerification(merchantId, kycCase.documents.map((document) => document.s3Key));
    await this.prisma.kycCase.update({
      where: { id: kycCase.id },
      data: {
        smileJobId: smile?.jobId,
        screeningHit: screening.hit,
        screeningLists: screening.lists,
        lastScreenedAt: new Date(),
      },
    });
    await this.transition(
      kycCase.id,
      'IN_REVIEW',
      'system',
      screening.hit ? `sanctions/PEP: ${screening.lists.join('/')}` : `Smile job ${smile?.jobId} en attente`,
    );
    return this.getCaseById(kycCase.id);
  }

  async handleSmileCallback(result: SmileCallbackResult) {
    const kycCase = await this.prisma.kycCase.findUnique({ where: { smileJobId: result.jobId } });
    if (!kycCase) throw new NotFoundException('Job Smile inconnu');
    if (kycCase.status === 'APPROVED' || kycCase.status === 'REJECTED') return this.getCaseById(kycCase.id);

    // On ne fait JAMAIS confiance au score/flags du corps du webhook : on
    // ré-interroge Smile par jobId pour la décision autoritative (ALP-VULN).
    const verified = await this.providers.getJobStatus(result.jobId);
    await this.prisma.kycCase.update({ where: { id: kycCase.id }, data: { smileScore: verified.score } });
    const autoApprove = !kycCase.screeningHit
      && verified.score >= SMILE_AUTO_APPROVE
      && verified.documentVerified
      && verified.biometricVerified;
    if (autoApprove) await this.approve(kycCase.id, kycCase.merchantId, 'smile-webhook');
    else await this.transition(kycCase.id, 'IN_REVIEW', 'smile-webhook', `score ${verified.score}; revue manuelle requise`);
    return this.getCaseById(kycCase.id);
  }

  async startDueReKyc(now = new Date()) {
    const cases = await this.prisma.kycCase.findMany({
      where: { status: 'APPROVED', reKycDueAt: { lte: now } },
      select: { id: true, merchantId: true },
      take: 500,
    });
    for (const kycCase of cases) {
      await this.prisma.$transaction([
        this.prisma.kycCase.update({
          where: { id: kycCase.id },
          data: { status: 'NEEDS_MORE', reKycStartedAt: now, decision: null, decidedBy: null, decidedAt: null },
        }),
        this.prisma.merchant.update({ where: { id: kycCase.merchantId }, data: { isActive: false } }),
        this.prisma.kycEvent.create({ data: { caseId: kycCase.id, action: 'RE_KYC_DUE', actor: 'system' } }),
      ]);
    }
    return cases.length;
  }

  async decide(caseId: string, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_MORE', officer: string, reason?: string) {
    const kycCase = await this.requireCase(caseId);
    if (kycCase.status === 'APPROVED' || kycCase.status === 'REJECTED') throw new BadRequestException(`Dossier déjà clôturé (${kycCase.status})`);
    if (decision === 'APPROVED') await this.approve(caseId, kycCase.merchantId, officer);
    else if (decision === 'REJECTED') {
      await this.prisma.kycCase.update({ where: { id: caseId }, data: { status: 'REJECTED', decision, decidedBy: officer, decidedAt: new Date(), rejectionReason: reason } });
      await this.prisma.merchant.update({ where: { id: kycCase.merchantId }, data: { isActive: false } }).catch(() => undefined);
      await this.event(caseId, 'REJECTED', officer, reason);
    } else await this.transition(caseId, 'NEEDS_MORE', officer, reason);
    return this.getCaseById(caseId);
  }

  private async approve(caseId: string, merchantId: string, actor: string) {
    const due = new Date();
    due.setMonth(due.getMonth() + RE_KYC_MONTHS);
    await this.prisma.kycCase.update({ where: { id: caseId }, data: { status: 'APPROVED', decision: 'APPROVED', decidedBy: actor, decidedAt: new Date(), reKycDueAt: due, reKycStartedAt: null } });
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { isActive: true } }).catch(() => undefined);
    await this.event(caseId, 'APPROVED', actor, `re-KYC le ${due.toISOString().slice(0, 10)}`);
    this.logger.log(`KYC approuvé pour ${merchantId} (case ${caseId})`);
  }

  listCases(status?: KycStatus) {
    return this.prisma.kycCase.findMany({ where: status ? { status } : undefined, orderBy: { updatedAt: 'desc' }, take: 100, select: { id: true, merchantId: true, status: true, smileScore: true, screeningHit: true, reKycDueAt: true, updatedAt: true } });
  }

  async getCaseById(id: string) {
    const kycCase = await this.prisma.kycCase.findUnique({ where: { id }, include: { documents: { select: { type: true, uploadedAt: true } }, events: true } });
    if (!kycCase) throw new NotFoundException('Dossier introuvable');
    return kycCase;
  }

  private async requireCase(id: string) {
    const kycCase = await this.prisma.kycCase.findUnique({ where: { id } });
    if (!kycCase) throw new NotFoundException('Dossier introuvable');
    return kycCase;
  }

  private async transition(caseId: string, status: KycStatus, actor: string, details?: string) {
    await this.prisma.kycCase.update({ where: { id: caseId }, data: { status } });
    await this.event(caseId, status, actor, details);
  }

  private event(caseId: string, action: string, actor: string, details?: string) {
    return this.prisma.kycEvent.create({ data: { caseId, action, actor, details } }).catch(() => undefined);
  }
}
