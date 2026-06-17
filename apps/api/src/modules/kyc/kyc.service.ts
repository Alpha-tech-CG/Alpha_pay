import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KycDocumentType, KycStatus, PrismaClient } from '@paybrain/database';
import { screenSanctions, verifyWithSmile } from './kyc.providers';

const REQUIRED_DOCS: KycDocumentType[] = ['ID_FRONT', 'RCCM', 'NIU'];
const SMILE_AUTO_APPROVE = 90;
const RE_KYC_MONTHS = 12;

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async ensureCase(merchantId: string) {
    const existing = await this.prisma.kycCase.findUnique({ where: { merchantId } });
    if (existing) return existing;
    return this.prisma.kycCase.create({
      data: { merchantId, status: 'NOT_STARTED', events: { create: { action: 'CREATED', actor: 'system' } } },
    });
  }

  /** Enregistre la référence S3 d'un document (upload via URL pré-signée). */
  async addDocument(merchantId: string, type: KycDocumentType, s3Key: string) {
    const kycCase = await this.ensureCase(merchantId);
    await this.prisma.kycDocument.upsert({
      where: { caseId_type: { caseId: kycCase.id, type } },
      update: { s3Key },
      create: { caseId: kycCase.id, type, s3Key },
    });
    await this.event(kycCase.id, 'DOCUMENT_ADDED', 'merchant', type);
    return { caseId: kycCase.id, type, ok: true };
  }

  /**
   * Soumission : vérifie les docs requis, lance la vérification auto (Smile +
   * screening sanctions/PEP), décide auto (score élevé) ou route en revue
   * manuelle. Approbation → activation du marchand.
   */
  async submit(merchantId: string) {
    const kycCase = await this.prisma.kycCase.findUnique({ where: { merchantId }, include: { documents: true } });
    if (!kycCase) throw new NotFoundException('Dossier KYC introuvable — ajouter des documents d\'abord');
    if (kycCase.status === 'APPROVED') throw new BadRequestException('Dossier déjà approuvé');

    const present = new Set(kycCase.documents.map((d) => d.type));
    const missing = REQUIRED_DOCS.filter((t) => !present.has(t));
    if (missing.length > 0) throw new BadRequestException(`Documents manquants : ${missing.join(', ')}`);

    await this.transition(kycCase.id, 'SUBMITTED', 'merchant');

    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { name: true } });
    const smile = await verifyWithSmile(merchantId);
    const screening = screenSanctions(merchant?.name ?? '');

    let status: KycStatus;
    if (screening.hit) {
      status = 'IN_REVIEW'; // un hit sanctions n'est jamais auto-approuvé
    } else if (smile.score >= SMILE_AUTO_APPROVE && smile.documentVerified && smile.biometricVerified) {
      status = 'APPROVED';
    } else {
      status = 'IN_REVIEW';
    }

    await this.prisma.kycCase.update({
      where: { id: kycCase.id },
      data: { smileScore: smile.score, screeningHit: screening.hit },
    });
    await this.transition(kycCase.id, status, 'system', `smile ${smile.score}, screening ${screening.hit ? screening.lists.join('/') : 'clear'}`);

    if (status === 'APPROVED') await this.approve(kycCase.id, merchantId, 'system');
    return this.getCaseById(kycCase.id);
  }

  /** Décision manuelle par un compliance officer. */
  async decide(caseId: string, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_MORE', officer: string, reason?: string) {
    const kycCase = await this.requireCase(caseId);
    if (kycCase.status === 'APPROVED' || kycCase.status === 'REJECTED') {
      throw new BadRequestException(`Dossier déjà clôturé (${kycCase.status})`);
    }
    if (decision === 'APPROVED') {
      await this.approve(caseId, kycCase.merchantId, officer);
    } else if (decision === 'REJECTED') {
      await this.prisma.kycCase.update({ where: { id: caseId }, data: { status: 'REJECTED', decision, decidedBy: officer, decidedAt: new Date(), rejectionReason: reason } });
      await this.prisma.merchant.update({ where: { id: kycCase.merchantId }, data: { isActive: false } }).catch(() => undefined);
      await this.event(caseId, 'REJECTED', officer, reason);
    } else {
      await this.transition(caseId, 'NEEDS_MORE', officer, reason);
    }
    return this.getCaseById(caseId);
  }

  private async approve(caseId: string, merchantId: string, actor: string) {
    const due = new Date();
    due.setMonth(due.getMonth() + RE_KYC_MONTHS);
    await this.prisma.kycCase.update({
      where: { id: caseId },
      data: { status: 'APPROVED', decision: 'APPROVED', decidedBy: actor, decidedAt: new Date(), reKycDueAt: due },
    });
    // Activation du marchand (accès API).
    await this.prisma.merchant.update({ where: { id: merchantId }, data: { isActive: true } }).catch(() => undefined);
    await this.event(caseId, 'APPROVED', actor, `re-KYC le ${due.toISOString().slice(0, 10)}`);
    this.logger.log(`KYC approuvé pour ${merchantId} (case ${caseId})`);
  }

  listCases(status?: KycStatus) {
    return this.prisma.kycCase.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, merchantId: true, status: true, smileScore: true, screeningHit: true, reKycDueAt: true, updatedAt: true },
    });
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
