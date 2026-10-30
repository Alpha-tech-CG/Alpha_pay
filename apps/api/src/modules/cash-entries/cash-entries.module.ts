import { Module } from '@nestjs/common';
import { CashEntriesController } from './cash-entries.controller';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [TeamAuthModule, StoresModule],
  controllers: [CashEntriesController],
})
export class CashEntriesModule {}
