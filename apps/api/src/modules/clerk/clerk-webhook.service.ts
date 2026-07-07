import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { deterministicHash, encryptField, normalizeEmail } from '@paybrain/shared';
import { NotificationService } from '../notifications/notification.service';

interface ClerkUserCreatedData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{ email_address: string; verification: { status: string } | null }>;
  phone_numbers?: Array<{ phone_number: string }>;
  public_metadata?: Record<string, unknown>;
}

type B = Uint8Array<ArrayBuffer>;

@Injectable()
export class ClerkWebhookService {
  private readonly logger = new Logger(ClerkWebhookService.name);

  // Email de l'équipe ops qui reçoit les notifications de nouveaux inscrits.
  private readonly opsEmail = process.env.OPS_EMAIL ?? 'ops@paybrain.cg';

  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  async handleUserCreated(data: ClerkUserCreatedData): Promise<void> {
    const primaryEmail = data.email_addresses.find(
      (e) => e.verification?.status === 'verified',
    )?.email_address ?? data.email_addresses[0]?.email_address;

    if (!primaryEmail) {
      this.logger.warn(`Clerk user.created sans email vérifiable (userId=${data.id}) — ignoré`);
      return;
    }

    const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || primaryEmail;
    const phone = data.phone_numbers?.[0]?.phone_number ?? null;
    const merchantType = (data.public_metadata?.type === 'DEVELOPER') ? 'DEVELOPER' : 'MERCHANT';

    const email = normalizeEmail(primaryEmail);
    const emailHash = deterministicHash(email);

    // Idempotent : retry Clerk ne recrée pas le compte.
    const existing = await this.prisma.merchant.findUnique({
      where: { emailHash: emailHash as unknown as B },
    });
    if (existing) {
      this.logger.warn(`Compte déjà créé pour ${primaryEmail} — doublon ignoré`);
      return;
    }

    const merchant = await this.prisma.merchant.create({
      data: {
        name,
        emailEncrypted: encryptField(email) as unknown as B,
        emailHash: emailHash as unknown as B,
        phone,
        clerkUserId: data.id,
        merchantType,
        onboardingStatus: 'PENDING',
        isActive: false,
      },
    });

    this.logger.log(`Nouveau compte PENDING : ${merchant.id} (${primaryEmail}, type=${merchantType})`);

    // Email de confirmation au nouvel inscrit — pas de clé API encore.
    await this.notifications.send({
      channel: 'EMAIL',
      to: primaryEmail,
      template: 'merchant.pending',
      data: { name },
      category: 'onboarding',
      merchantId: merchant.id,
    });

    // Notification interne à l'équipe ops.
    await this.notifications.send({
      channel: 'EMAIL',
      to: this.opsEmail,
      template: 'ops.new-signup',
      data: { name, email: primaryEmail, merchantId: merchant.id, merchantType },
      category: 'internal',
    });
  }
}
