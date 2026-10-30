import { Module } from '@nestjs/common';
import { SchoolController } from './school.controller';
import { SchoolService } from './school.service';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { InvoicingModule } from '../invoicing/invoicing.module';

@Module({
  imports: [TeamAuthModule, InvoicingModule],
  controllers: [SchoolController],
  providers: [SchoolService],
  exports: [SchoolService],
})
export class SchoolModule {}
