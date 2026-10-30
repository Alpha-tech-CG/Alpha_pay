import { ModuleAccessGuard, RequireModule } from '../billing/module-access.guard';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { CustomersService, CreateCustomerDto } from './customers.service';
import { CreateInvoiceDto, InstallmentDto, InvoicesService } from './invoices.service';

@Controller('v1/merchants/:merchantId')
@UseGuards(SessionGuard, RequireMemberGuard, ModuleAccessGuard)
@RequireModule('m7_recover')
export class InvoicingController {
  constructor(
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
  ) {}

  // ─── Clients ───────────────────────────────────────────────────────────────

  @Post('customers')
  createCustomer(@Param('merchantId') _mid: string, @Req() req: any, @Body() body: CreateCustomerDto) {
    const { merchantId } = req.membership;
    return this.customers.create(merchantId, body);
  }

  @Get('customers')
  listCustomers(
    @Param('merchantId') _mid: string,
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const { merchantId } = req.membership;
    return this.customers.list(merchantId, cursor, limit ? parseInt(limit) : 25);
  }

  @Get('customers/:customerId')
  getCustomer(
    @Param('merchantId') _mid: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.customers.get(merchantId, customerId);
  }

  @Patch('customers/:customerId')
  updateCustomer(
    @Param('merchantId') _mid: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Req() req: any,
    @Body() body: Partial<CreateCustomerDto>,
  ) {
    const { merchantId } = req.membership;
    return this.customers.update(merchantId, customerId, body);
  }

  @Delete('customers/:customerId')
  deleteCustomer(
    @Param('merchantId') _mid: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Req() req: any,
  ): Promise<void> {
    const { merchantId } = req.membership;
    return this.customers.remove(merchantId, customerId);
  }

  // ─── Factures ─────────────────────────────────────────────────────────────

  @Post('invoices')
  createInvoice(@Param('merchantId') _mid: string, @Req() req: any, @Body() body: CreateInvoiceDto) {
    const { merchantId } = req.membership;
    const livemode = req.livemode ?? false;
    return this.invoices.create(merchantId, livemode, body);
  }

  @Get('invoices')
  listInvoices(
    @Param('merchantId') _mid: string,
    @Req() req: any,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const { merchantId } = req.membership;
    return this.invoices.list(merchantId, status, cursor, limit ? parseInt(limit) : 25);
  }

  @Get('invoices/:invoiceId')
  getInvoice(
    @Param('merchantId') _mid: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.invoices.get(merchantId, invoiceId);
  }

  @Post('invoices/:invoiceId/send')
  sendInvoice(
    @Param('merchantId') _mid: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.invoices.send(merchantId, invoiceId);
  }

  @Post('invoices/:invoiceId/void')
  voidInvoice(
    @Param('merchantId') _mid: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.invoices.void(merchantId, invoiceId);
  }

  @Post('invoices/:invoiceId/pdf')
  generatePdf(
    @Param('merchantId') _mid: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.invoices.generatePdf(merchantId, invoiceId).then((key) => ({ pdf_key: key }));
  }

  // ─── Versements (T-75) ────────────────────────────────────────────────────

  @Post('invoices/:invoiceId/installments')
  setInstallments(
    @Param('merchantId') _mid: string,
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Req() req: any,
    @Body() body: { installments: InstallmentDto[] },
  ) {
    const { merchantId } = req.membership;
    return this.invoices.setInstallments(merchantId, invoiceId, body.installments ?? []);
  }

  // ─── Reçus (T-77) ─────────────────────────────────────────────────────────

  @Get('receipts')
  listReceipts(@Param('merchantId') _mid: string, @Req() req: any) {
    const { merchantId } = req.membership;
    return this.invoices.listReceipts(merchantId);
  }
}
