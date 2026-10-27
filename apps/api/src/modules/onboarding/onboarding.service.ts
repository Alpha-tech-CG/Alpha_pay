import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../../common/storage/s3-client';
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
  private readonly s3 = createS3Client('af-south-1');

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  /** Inscription publique standard : crée un compte PENDING et notifie les ops. */
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
