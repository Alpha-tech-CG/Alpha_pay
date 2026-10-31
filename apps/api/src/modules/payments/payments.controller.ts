import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PrismaClient, TransactionStatus } from '@paybrain/database';
import { PUBLIC_PAYMENT_STATUS } from '@paybrain/shared';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { afterCursor, decodeCursor, page, parseLimit } from '../../common/pagination/cursor';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, CreateRefundDto } from './dto/create-payment.dto';
import { presentRefund, RefundsService } from './refunds.service';
import { presentPayment } from './payment.presenter';

export const STATUS_BY_LABEL = Object.fromEntries(Object.entries(PUBLIC_PAYMENT_STATUS).map(([k, v]) => [v, k])) as Record<
  string,
  TransactionStatus
>;

/** API publique des paiements (§7, T-51) : le mode test/live est porté par la clé. */
@ApiTags('Paiements')
@ApiSecurity('ApiKey')
@Controller('v1/payments')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly refunds: RefundsService,
  ) {}

  @Post()
  @HttpCode(201)
  @RequiredScopes('payments:write')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Créer un paiement Mobile Money (MTN, Airtel) ou par carte (redirect_url à ouvrir)' })
  async create(@Body() dto: CreatePaymentDto, @Req() req: any) {
    if (dto.method === 'card') {
      const tx = await this.paymentsService.initiateCardPayment(
        { amount: dto.amount, currency: dto.currency, reference: dto.reference, description: dto.description, tillId: dto.till_id, returnUrl: dto.return_url!, cancelUrl: dto.cancel_url },
        req.merchant.id,
        req.livemode === true,
      );
      return presentPayment(tx);
    }
    const tx = await this.paymentsService.initiatePayment(
      { ...dto, tillId: dto.till_id },
      req.merchant.id,
      req.livemode === true,
    );
    return presentPayment(tx);
  }

  @Post(':id/refunds')
  @HttpCode(201)
  @RequiredScopes('payments:write')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Rembourser un paiement réussi (total ou partiel)' })
  async refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRefundDto, @Req() req: any) {
    const refund = await this.refunds.create(id, req.merchant.id, req.livemode === true, dto, { type: 'api_key', id: req.apiKeyId, ip: req.ip });
    return presentRefund(refund);
  }

  @Get(':id/refunds')
  @RequiredScopes('payments:read')
  @ApiOperation({ summary: "Lister les remboursements d'un paiement" })
  async listRefunds(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    await this.paymentsService.findOne(id, req.merchant.id, req.livemode === true);
    return { object: 'list', data: (await this.refunds.list(id, req.merchant.id, req.livemode === true)).map(presentRefund) };
  }

  @Get(':id')
  @RequiredScopes('payments:read')
  @ApiOperation({ summary: 'Lire un paiement' })
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return presentPayment(await this.paymentsService.findOne(id, req.merchant.id, req.livemode === true));
  }

  @Get()
  @RequiredScopes('payments:read')
  @ApiOperation({ summary: 'Lister les paiements (pagination par curseur : limit, starting_after)' })
  async list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('till_id') tillId?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
  ) {
    const n = parseLimit(limit);
    const rows = await this.prisma.transaction.findMany({
      where: {
        merchantId: req.merchant.id,
        livemode: req.livemode === true,
        ...(tillId ? { tillId } : {}),
        ...(status ? { status: STATUS_BY_LABEL[status] ?? (status.toUpperCase() as TransactionStatus) } : {}),
        ...afterCursor(decodeCursor(startingAfter)),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: n + 1,
    });
    return page(rows, n, presentPayment);
  }
}
