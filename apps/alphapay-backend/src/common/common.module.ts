import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';

/** Global utilities (encryption) available to every module without re-importing. */
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class CommonModule {}
