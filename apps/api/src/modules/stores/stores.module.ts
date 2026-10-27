import { Module } from '@nestjs/common';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

/** T-50 — Boutiques, caisses et caissiers. */
@Module({
  imports: [TeamAuthModule],
  controllers: [StoresController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
