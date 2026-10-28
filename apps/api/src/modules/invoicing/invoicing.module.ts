import { Module } from '@nestjs/common';
import { InvoicingController } from './invoicing.controller';
import { CustomersService } from './customers.service';
import { InvoicesService } from './invoices.service';
import { TeamAuthModule } from '../team/auth/team-auth.module';

@Module({
  imports: [TeamAuthModule],
  controllers: [InvoicingController],
  providers: [CustomersService, InvoicesService],
  exports: [InvoicesService],
})
export class InvoicingModule {}
