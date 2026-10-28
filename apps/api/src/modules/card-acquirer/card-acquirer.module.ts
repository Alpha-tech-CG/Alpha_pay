import { Module } from '@nestjs/common';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { CardAcquirerController, MockCardController } from './card-acquirer.controller';
import { CardAcquirerService } from './card-acquirer.service';

@Module({
  imports: [TeamAuthModule],
  controllers: [CardAcquirerController, MockCardController],
  providers: [CardAcquirerService],
  exports: [CardAcquirerService],
})
export class CardAcquirerModule {}
