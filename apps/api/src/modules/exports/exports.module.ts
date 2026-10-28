import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { TeamAuthModule } from '../team/auth/team-auth.module';

@Module({
  imports: [TeamAuthModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
