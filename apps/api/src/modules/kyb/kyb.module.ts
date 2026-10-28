import { Module } from '@nestjs/common';
import { KycProvider, MockKycProvider, SumsubKycProvider } from '@paybrain/providers';
import { FileStorage, fileStorageFromEnv } from '../../common/storage/file-storage';
import { MessagingModule } from '../messaging/messaging.module';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { StaffModule } from '../staff/staff.module';
import { FilesController, KybAdminController, KybController, KycWebhookController, MockKycController } from './kyb.controller';
import { KybService, KYC_PROVIDER } from './kyb.service';

/** Fournisseur KYC (§2.7) : KYC_PROVIDER=sumsub (contrat requis) ou mock (par défaut). */
export function kycProviderFromEnv(env: NodeJS.ProcessEnv = process.env): KycProvider {
  if (env.KYC_PROVIDER === 'sumsub') {
    return new SumsubKycProvider({
      appToken: env.SUMSUB_APP_TOKEN!,
      secretKey: env.SUMSUB_SECRET_KEY!,
      webhookSecret: env.SUMSUB_WEBHOOK_SECRET!,
      levelName: env.SUMSUB_LEVEL_NAME ?? 'basic-kyc-level',
      baseUrl: env.SUMSUB_BASE_URL,
    });
  }
  return new MockKycProvider({ webhookSecret: env.KYC_WEBHOOK_SECRET ?? 'mock-kyc-secret', baseUrl: env.PUBLIC_API_URL });
}

/** M2 — Onboarding marchand : dossier KYB, pièces chiffrées, KYC du dirigeant, revue AlphaPay. */
@Module({
  imports: [MessagingModule, TeamAuthModule, StaffModule],
  controllers: [KybController, KybAdminController, FilesController, KycWebhookController, MockKycController],
  providers: [KybService, { provide: KYC_PROVIDER, useFactory: () => kycProviderFromEnv() }, { provide: FileStorage, useFactory: fileStorageFromEnv }],
  exports: [KybService],
})
export class KybModule {}
