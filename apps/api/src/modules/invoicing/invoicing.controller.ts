import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { parseLimit } from '../../common/pagination/cursor';
import { ModuleAccessGuard, RequireModule } from '../billing/module-access.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { CustomersService } from './customers.service';
import { InvoiceActor, InvoicesService } from './invoices.service';
import { CreateCustomerDto, CreateInvoiceDto, ListInvoicesQuery, RecoverySettingsDto, SetInstallmentsDto, UpdateCustomerDto } from './invoicing.dto';
import { RecoveryService } from './recovery.service';
import { RemindersService } from './reminders.service';

function actor(req: any): InvoiceActor {
  return { type: 'user', id: req.appUser.id, ip: req.ip };
}

const live = (mode?: string) => mode === 'live';

/**
 * Recouvrer depuis le tableau de bord (§M7). Lecture : propriétaire,
 * administrateur, comptable ; écriture : propriétaire et administrateur
 * (contrôle CÔTÉ SERVEUR). Le mode test/live est porté par `?mode=`.
 */
@ApiTags('Recouvrer (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard, ModuleAccessGuard)
@RequireModule('m7_recover')
export class InvoicingController {
  constructor(
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly recovery: RecoveryService,
    private readonly reminders: RemindersService,
  ) {}

  // ─── Clients ───────────────────────────────────────────────────────────────

  @Post('customers')
  @RequireAction('invoices:write')
  createCustomer(@Param('merchantId') merchantId: string, @Query('mode') mode: string | undefined, @Body() dto: CreateCustomerDto) {
    return this.customers.create(merchantId, live(mode), dto);
  }

  @Get('customers')
  @RequireAction('invoices:view')
  listCustomers(
    @Param('merchantId') merchantId: string,
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
    @Query('q') q?: string,
  ) {
    return this.customers.list(merchantId, live(mode), parseLimit(limit), startingAfter, q);
  }

  @Get('customers/:customerId')
  @RequireAction('invoices:view')
  getCustomer(@Param('merchantId') merchantId: string, @Param('customerId', ParseUUIDPipe) id: string, @Query('mode') mode?: string) {
    return this.customers.get(merchantId, live(mode), id);
  }

  @Patch('customers/:customerId')
  @RequireAction('invoices:write')
  updateCustomer(@Param('merchantId') merchantId: string, @Param('customerId', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(merchantId, live(mode), id, dto);
  }

  @Delete('customers/:customerId')
  @HttpCode(204)
  @RequireAction('invoices:write')
  deleteCustomer(@Param('merchantId') merchantId: string, @Param('customerId', ParseUUIDPipe) id: string, @Query('mode') mode?: string): Promise<void> {
    return this.customers.remove(merchantId, live(mode), id);
  }

  // ─── Factures ─────────────────────────────────────────────────────────────

  @Post('invoices')
  @RequireAction('invoices:write')
  @ApiOperation({ summary: 'Créer une facture (brouillon, ou envoyée avec send=true)' })
  createInvoice(@Param('merchantId') merchantId: string, @Query('mode') mode: string | undefined, @Body() dto: CreateInvoiceDto, @Req() req: any) {
    return this.invoices.create(merchantId, live(mode), dto, actor(req));
  }

  @Get('invoices')
  @RequireAction('invoices:view')
  listInvoices(
    @Param('merchantId') merchantId: string,
    @Query() query: ListInvoicesQuery,
  ) {
    return this.invoices.list(merchantId, live(query.mode), query, parseLimit(query.limit), query.starting_after);
  }

  @Get('invoices/:invoiceId')
  @RequireAction('invoices:view')
  getInvoice(@Param('merchantId') merchantId: string, @Param('invoiceId', ParseUUIDPipe) id: string, @Query('mode') mode?: string) {
    return this.invoices.get(merchantId, live(mode), id);
  }

  @Post('invoices/:invoiceId/send')
  @HttpCode(200)
  @RequireAction('invoices:write')
  @ApiOperation({ summary: 'Envoyer : numéro, lien(s) de paiement, relances, message au client' })
  sendInvoice(@Param('merchantId') merchantId: string, @Param('invoiceId', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Req() req: any) {
    return this.invoices.send(merchantId, live(mode), id, actor(req));
  }

  @Post('invoices/:invoiceId/resend')
  @HttpCode(200)
  @RequireAction('invoices:write')
  @ApiOperation({ summary: 'Renvoyer la facture au client' })
  async resendInvoice(@Param('merchantId') merchantId: string, @Param('invoiceId', ParseUUIDPipe) id: string, @Query('mode') mode?: string) {
    await this.invoices.find(merchantId, live(mode), id);
    return { sent: await this.invoices.notifyCustomer(id) };
  }

  @Post('invoices/:invoiceId/void')
  @HttpCode(200)
  @RequireAction('invoices:write')
  voidInvoice(@Param('merchantId') merchantId: string, @Param('invoiceId', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Req() req: any) {
    return this.invoices.void(merchantId, live(mode), id, actor(req));
  }

  @Put('invoices/:invoiceId/installments')
  @RequireAction('invoices:write')
  @ApiOperation({ summary: "Remplacer l'échéancier (brouillon uniquement)" })
  setInstallments(@Param('merchantId') merchantId: string, @Param('invoiceId', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Body() dto: SetInstallmentsDto, @Req() req: any) {
    return this.invoices.setInstallments(merchantId, live(mode), id, dto.installments, actor(req));
  }

  @Get('invoices/:invoiceId/pdf')
  @RequireAction('invoices:view')
  @ApiProduces('application/pdf')
  async invoicePdf(@Param('merchantId') merchantId: string, @Param('invoiceId', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Res() res: any) {
    const { filename, pdf } = await this.invoices.pdf(merchantId, live(mode), id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(pdf);
  }

  // ─── Reçus ────────────────────────────────────────────────────────────────

  @Get('receipts')
  @RequireAction('invoices:view')
  listReceipts(
    @Param('merchantId') merchantId: string,
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
    @Query('invoice_id') invoiceId?: string,
  ) {
    return this.recovery.listReceipts(merchantId, live(mode), parseLimit(limit), startingAfter, invoiceId);
  }

  @Get('receipts/:receiptId/pdf')
  @RequireAction('invoices:view')
  @ApiProduces('application/pdf')
  async receiptPdf(@Param('merchantId') merchantId: string, @Param('receiptId', ParseUUIDPipe) id: string, @Res() res: any) {
    const { filename, pdf } = await this.recovery.receiptPdf(merchantId, id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(pdf);
  }

  // ─── Réglages des relances ────────────────────────────────────────────────

  @Get('recovery-settings')
  @RequireAction('invoices:view')
  getSettings(@Param('merchantId') merchantId: string) {
    return this.reminders.getSettings(merchantId);
  }

  @Patch('recovery-settings')
  @RequireAction('invoices:write')
  updateSettings(@Param('merchantId') merchantId: string, @Body() dto: RecoverySettingsDto, @Req() req: any) {
    return this.reminders.updateSettings(merchantId, dto, { id: req.appUser.id, ip: req.ip });
  }
}
