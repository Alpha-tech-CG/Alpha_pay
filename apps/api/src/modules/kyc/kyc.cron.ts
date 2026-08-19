import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { KycService } from './kyc.service';
import { CronLockService } from '../../common/scheduling/cron-lock.service';

@Injectable()
export class KycCron {
  private readonly logger = new Logger(KycCron.name);
  constructor(
    private readonly kyc: KycService,
    private readonly cronLock: CronLockService,
  ) {}
  @Cron('0 15 1 * * *', { timeZone: 'Africa/Brazzaville' })
  async startAnnualReviews() {
    // Exclusion multi-instance : une seule instance déclenche les re-KYC annuels.
    await this.cronLock.runExclusive('kyc-annual-rekyc', async () => {
      const count = await this.kyc.startDueReKyc();
      if (count > 0) this.logger.log(`${count} dossier(s) placé(s) en re-KYC annuel`);
    });
  }
}
