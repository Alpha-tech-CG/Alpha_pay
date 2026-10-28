import { Module } from '@nestjs/common';
import { CashEntriesController } from './cash-entries.controller';
import { TeamAuthModule } from '../team/auth/team-auth.module';

@Module({
  imports: [TeamAuthModule],
  controllers: [CashEntriesController],
})
export class CashEntriesModule {}
