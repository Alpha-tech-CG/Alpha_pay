import { Module } from '@nestjs/common';
import { PersonalController } from './personal.controller';
import { PersonalService } from './personal.service';

/** Espace particulier (D-065) : budget, épargne suivie, envois AlphaPay déclarés. */
@Module({
  controllers: [PersonalController],
  providers: [PersonalService],
  exports: [PersonalService],
})
export class PersonalModule {}
