import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@paybrain/database';
import { deterministicHash, encryptField, normalizeEmail } from '@paybrain/shared';
import { NotificationService } from '../notifications/notification.service';
import { UsersService } from '../users/users.service';

interface ClerkUserCreatedData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{ email_address: string; verification: { status: string } | null }>;
  phone_numbers?: Array<{ phone_number: string }>;
  public_metadata?: Record<string, unknown>;
}

type ClerkUserUpdatedData = ClerkUserCreatedData;

interface ClerkUserDeletedData {
  id: string;
  deleted: boolean;
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
    private readonly users: UsersService,
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

    // Miroir app_users (Team Members) — indépendant de la création du Merchant
    // ci-dessous, qui reste le compte marchand « historique » 1:1 avec Clerk.
    await this.users.upsertFromClerk({ clerkUserId: data.id, email: primaryEmail, fullName: name });

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

  async handleUserUpdated(data: ClerkUserUpdatedData): Promise<void> {
    const primaryEmail = data.email_addresses.find(
      (e) => e.verification?.status === 'verified',
    )?.email_address ?? data.email_addresses[0]?.email_address;

    if (!primaryEmail) {
      this.logger.warn(`Clerk user.updated sans email vérifiable (userId=${data.id}) — ignoré`);
      return;
    }

    const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || primaryEmail;
    await this.users.upsertFromClerk({ clerkUserId: data.id, email: primaryEmail, fullName: name });
  }

  async handleUserDeleted(data: ClerkUserDeletedData): Promise<void> {
    await this.users.markDeletedByClerkUserId(data.id);
  }
}
