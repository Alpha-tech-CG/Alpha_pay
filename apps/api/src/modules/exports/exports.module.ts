import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { QueueModule } from '../../common/queue/queue.module';

@Module({
  imports: [TeamAuthModule, QueueModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
