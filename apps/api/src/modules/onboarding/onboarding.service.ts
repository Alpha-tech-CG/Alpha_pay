import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { decryptField, deterministicHash, encryptField, normalizeEmail } from '@paybrain/shared';
import { generateApiKey, hashApiKeySecret } from '../../common/security/api-key';
import { NotificationService } from '../notifications/notification.service';

type B = Uint8Array<ArrayBuffer>;

const ID_DOCUMENT_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export interface UploadedIdDocument {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION ?? 'af-south-1' });

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  /** Inscription publique standard : crée un compte PENDING et notifie les ops. */
  async registerStandard(dto: {
    fullName: string;
    phone: string;
    email: string;
    company?: string;
  }) {
    const email = normalizeEmail(dto.email);
    const emailHash = deterministicHash(email) as unknown as B;

    const existing = await this.prisma.merchant.findUnique({ where: { emailHash } });
    if (existing) throw new ConflictException('Un compte avec cet email existe déjà');

    const merchant = await this.prisma.merchant.create({
      data: {
        name: dto.fullName,
        emailEncrypted: encryptField(email) as unknown as B,
        emailHash,
        phone: dto.phone.replace(/\s/g, ''),
        companyName: dto.company ?? null,
        onboardingStatus: 'PENDING',
        isActive: false,
      },
      select: { id: true, name: true, merchantType: true },
    });

    this.logger.log(`Nouvelle inscription standard : ${merchant.id} (${email})`);

    await Promise.allSettled([
      this.notifications.send({
        channel: 'EMAIL',
        to: email,
        template: 'merchant.pending',
        data: { name: merchant.name },
        category: 'onboarding',
        merchantId: merchant.id,
      }),
      this.notifications.send({
        channel: 'EMAIL',
        to: process.env.OPS_EMAIL ?? 'ops@paybrain.cg',
        template: 'ops.new-signup',
        data: {
          name: merchant.name,
          email,
          merchantType: merchant.merchantType,
          merchantId: merchant.id,
        },
        category: 'onboarding',
        merchantId: merchant.id,
      }),
    ]);

    return { ok: true };
  }

  /** Inscription développeur : dossier complet avec pièce d'identité, compte PENDING. */
  async registerDeveloper(
    dto: {
      fullName: string;
      phone: string;
      email: string;
      company: string;
      website?: string;
      useCase: string;
    },
    idDocument?: UploadedIdDocument,
  ) {
    const email = normalizeEmail(dto.email);
    const emailHash = deterministicHash(email) as unknown as B;

    const existing = await this.prisma.merchant.findUnique({ where: { emailHash } });
    if (existing) throw new ConflictException('Un compte avec cet email existe déjà');

    const merchant = await this.prisma.merchant.create({
      data: {
        name: dto.fullName,
        emailEncrypted: encryptField(email) as unknown as B,
        emailHash,
        phone: dto.phone.replace(/\s/g, ''),
        companyName: dto.company,
        website: dto.website ?? null,
        useCase: dto.useCase,
        merchantType: 'DEVELOPER',
        onboardingStatus: 'PENDING',
        isActive: false,
      },
      select: { id: true, name: true, merchantType: true },
    });

    if (idDocument) {
      const key = await this.#storeIdDocument(merchant.id, idDocument);
      if (key) {
        await this.prisma.merchant.update({
          where: { id: merchant.id },
          data: { idDocumentKey: key },
        });
      }
    }

    this.logger.log(`Nouvelle inscription développeur : ${merchant.id} (${email})`);

    await Promise.allSettled([
      this.notifications.send({
        channel: 'EMAIL',
        to: email,
        template: 'merchant.pending',
        data: { name: merchant.name },
        category: 'onboarding',
        merchantId: merchant.id,
      }),
      this.notifications.send({
        channel: 'EMAIL',
        to: process.env.OPS_EMAIL ?? 'ops@paybrain.cg',
        template: 'ops.new-signup',
        data: {
          name: merchant.name,
          email,
          merchantType: merchant.merchantType,
          merchantId: merchant.id,
        },
        category: 'onboarding',
        merchantId: merchant.id,
      }),
    ]);

    return { ok: true };
  }

  /**
   * Stocke la pièce d'identité dans le bucket KYC chiffré (SSE AES-256).
   * En production le stockage est obligatoire (fail-closed) ; en dev sans
   * bucket configuré on continue avec un avertissement.
   */
  async #storeIdDocument(merchantId: string, doc: UploadedIdDocument): Promise<string | null> {
    const bucket = process.env.KYC_DOCUMENTS_BUCKET;
    if (!bucket) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('Stockage des documents non configuré');
      }
      this.logger.warn(`KYC_DOCUMENTS_BUCKET absent — pièce d'identité non stockée (dev), marchand ${merchantId}`);
      return null;
    }

    const extension = ID_DOCUMENT_EXTENSIONS[doc.mimetype];
    if (!extension) throw new ConflictException('Format de document non supporté (JPG, PNG ou PDF)');

    const key = `onboarding/${merchantId}/id-document-${randomUUID()}.${extension}`;
    await this.s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: doc.buffer,
      ContentType: doc.mimetype,
      ServerSideEncryption: 'AES256',
      Metadata: { merchant: merchantId, type: 'ONBOARDING_ID' },
    }));
    return key;
  }

  /** Liste les marchands en attente de validation, triés par date d'inscription. */
  async listPending() {
    const merchants = await this.prisma.merchant.findMany({
      where: { onboardingStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        emailEncrypted: true,
        phone: true,
        companyName: true,
        country: true,
        merchantType: true,
        onboardingStatus: true,
        createdAt: true,
      },
    });

    return merchants.map((m) => ({
      ...m,
      email: decryptField(m.emailEncrypted as unknown as Buffer),
      emailEncrypted: undefined,
    }));
  }

  /** Approuve un marchand : l'active, génère sa première clé API test, envoie l'email. */
  async approve(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, name: true, emailEncrypted: true, onboardingStatus: true },
    });
    if (!merchant) throw new NotFoundException('Marchand introuvable');

    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { onboardingStatus: 'APPROVED', isActive: true, rejectionReason: null },
    });

    const { full, prefix, secret } = generateApiKey('test');
    await this.prisma.apiKey.create({
      data: {
        merchantId,
        name: 'Clé initiale (test)',
        mode: 'TEST',
        prefix,
        hashedSecret: await hashApiKeySecret(secret),
        scopes: ['payments:write', 'payments:read', 'paylinks:write'],
        ipAllowlist: [],
      },
    });

    const email = decryptField(merchant.emailEncrypted as unknown as Buffer);
    this.logger.log(`Marchand approuvé : ${merchantId} (${email})`);

    await this.notifications.send({
      channel: 'EMAIL',
      to: email,
      template: 'merchant.approved',
      data: { name: merchant.name, apiKey: full },
      category: 'onboarding',
      merchantId,
    });

    return { ok: true, merchantId };
  }

  /** Rejette un marchand avec un motif. */
  async reject(merchantId: string, reason: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, name: true, emailEncrypted: true },
    });
    if (!merchant) throw new NotFoundException('Marchand introuvable');

    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { onboardingStatus: 'REJECTED', isActive: false, rejectionReason: reason },
    });

    const email = decryptField(merchant.emailEncrypted as unknown as Buffer);
    this.logger.log(`Marchand rejeté : ${merchantId} — ${reason}`);

    await this.notifications.send({
      channel: 'EMAIL',
      to: email,
      template: 'merchant.rejected',
      data: { name: merchant.name, reason },
      category: 'onboarding',
      merchantId,
    });

    return { ok: true, merchantId };
  }
}
