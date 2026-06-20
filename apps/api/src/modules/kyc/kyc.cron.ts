import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KycService } from './kyc.service';

@Injectable()
export class KycCron {
  private readonly logger = new Logger(KycCron.name);
  constructor(private readonly kyc: KycService) {}
  @Cron('0 15 1 * * *', { timeZone: 'Africa/Brazzaville' })
  async startAnnualReviews() {
    const count = await this.kyc.startDueReKyc();
    if (count > 0) this.logger.log(`${count} dossier(s) placé(s) en re-KYC annuel`);
  }
}
