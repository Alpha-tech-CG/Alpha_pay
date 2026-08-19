import { Global, Module } from '@nestjs/common';
import { CronLockService } from './cron-lock.service';

/**
 * Expose `CronLockService` globalement (comme DatabaseModule) pour que n'importe
 * quel cron puisse s'exécuter en exclusion multi-instance sans réimport local.
 */
@Global()
@Module({
  providers: [CronLockService],
  exports: [CronLockService],
})
export class SchedulingModule {}
