import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiExcludeController, ApiOperation, ApiProduces, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { ApiError } from '../../common/errors/api-error';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { parseLimit } from '../../common/pagination/cursor';
import { isValidDocumentSignature } from '../providers/callback-token';
import { CustomersService } from './customers.service';
import { InvoiceActor, InvoicesService } from './invoices.service';
import { CreateCustomerDto, CreateInvoiceDto, ListInvoicesQuery } from './invoicing.dto';
import { RecoveryService } from './recovery.service';

function keyActor(req: any): InvoiceActor {
  return { type: 'api_key', id: req.apiKeyId ?? req.merchant.id, ip: req.ip };
}

/**
 * API publique Recouvrer (§7) : `/v1/invoices`, `/v1/customers`. Le mode
 * test/live est porté par la clé ; `Idempotency-Key` accepté sur les POST.
 */
@ApiTags('Factures')
@ApiSecurity('ApiKey')
@Controller('v1')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class PublicInvoicingController {
  constructor(
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
  ) {}

  @Post('customers')
  @RequiredScopes('invoices:write')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Créer un client' })
  createCustomer(@Body() dto: CreateCustomerDto, @Req() req: any) {
    return this.customers.create(req.merchant.id, req.livemode === true, dto);
  }

  @Get('customers/:id')
  @RequiredScopes('invoices:read')
  @ApiOperation({ summary: 'Lire un client' })
  getCustomer(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.customers.get(req.merchant.id, req.livemode === true, id);
  }

  @Post('invoices')
  @RequiredScopes('invoices:write')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Créer une facture (send=true pour l’envoyer avec son lien de paiement)' })
  createInvoice(@Body() dto: CreateInvoiceDto, @Req() req: any) {
    return this.invoices.create(req.merchant.id, req.livemode === true, dto, keyActor(req));
  }

  @Get('invoices/:id')
  @RequiredScopes('invoices:read')
  @ApiOperation({ summary: 'Lire une facture' })
  getInvoice(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.invoices.get(req.merchant.id, req.livemode === true, id);
  }

  @Get('invoices')
  @RequiredScopes('invoices:read')
  @ApiOperation({ summary: 'Lister les factures (pagination par curseur)' })
  listInvoices(@Query() query: ListInvoicesQuery, @Req() req: any) {
    return this.invoices.list(req.merchant.id, req.livemode === true, query, parseLimit(query.limit), query.starting_after);
  }

  @Post('invoices/:id/send')
  @RequiredScopes('invoices:write')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Envoyer une facture en brouillon' })
  sendInvoice(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.invoices.send(req.merchant.id, req.livemode === true, id, keyActor(req));
  }
}

/**
 * Documents envoyés au client par SMS, WhatsApp ou email (§M7) : reçu ou
 * facture en PDF, par lien signé, sans compte.
 */
@ApiExcludeController()
@Controller('v1/public/documents')
export class PublicDocumentsController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly recovery: RecoveryService,
  ) {}

  @Get(':kind/:id/:sig')
  @ApiProduces('application/pdf')
  async document(@Param('kind') kind: string, @Param('id', ParseUUIDPipe) id: string, @Param('sig') sig: string, @Res() res: any) {
    if ((kind !== 'receipt' && kind !== 'invoice') || !isValidDocumentSignature(kind, id, sig)) {
      throw new ApiError(HttpStatus.NOT_FOUND, 'document_introuvable', 'Document introuvable');
    }
    const { filename, pdf } = kind === 'receipt' ? await this.recovery.receiptPdf(undefined, id) : await this.invoices.publicPdf(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, max-age=300', 'X-Robots-Tag': 'noindex' });
    res.send(pdf);
  }
}
