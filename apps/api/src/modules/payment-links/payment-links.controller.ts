import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { parseLimit } from '../../common/pagination/cursor';
import { SessionGuard } from '../auth/session.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { CreatePaymentLinkDto, PayLinkCardDto, PayLinkDto, SendPaymentLinkDto } from './payment-links.dto';
import { CreateLinkInput, LinkActor, PaymentLinksService } from './payment-links.service';

function toInput(dto: CreatePaymentLinkDto): CreateLinkInput {
  return {
    amount: dto.amount,
    currency: dto.currency,
    description: dto.description,
    expiresAt: dto.expires_at ? new Date(dto.expires_at) : undefined,
    multiUse: dto.multi_use,
  };
}

const keyActor = (req: any): LinkActor => ({ type: 'api_key', id: req.apiKeyId, ip: req.ip });
const userActor = (req: any): LinkActor => ({ type: 'user', id: req.appUser.id, ip: req.ip });

/** API publique : /v1/payment-links (§7), mode porté par la clé. */
@ApiTags('Liens de paiement')
@ApiSecurity('ApiKey')
@Controller('v1/payment-links')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class PaymentLinksController {
  constructor(private readonly links: PaymentLinksService) {}

  @Post()
  @HttpCode(201)
  @RequiredScopes('paylinks:write')
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Créer un lien de paiement (montant fixe ou libre)' })
  create(@Body() dto: CreatePaymentLinkDto, @Req() req: any) {
    return this.links.create(req.merchant.id, req.livemode === true, toInput(dto), keyActor(req));
  }

  @Get(':id')
  @RequiredScopes('paylinks:read')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.links.get(req.merchant.id, req.livemode === true, id);
  }

  @Get()
  @RequiredScopes('paylinks:read')
  list(@Req() req: any, @Query('limit') limit?: string, @Query('starting_after') startingAfter?: string) {
    return this.links.list(req.merchant.id, req.livemode === true, parseLimit(limit), startingAfter);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequiredScopes('paylinks:write')
  deactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.links.deactivate(req.merchant.id, req.livemode === true, id, keyActor(req));
  }
}

/** Tableau de bord : liens du marchand (création et désactivation réservées au propriétaire et aux administrateurs). */
@ApiTags('Liens de paiement (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/payment-links')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard)
export class MerchantPaymentLinksController {
  constructor(private readonly links: PaymentLinksService) {}

  @Get()
  @RequireAction('payments:view')
  list(
    @Param('merchantId') merchantId: string,
    @Query('mode') mode?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
  ) {
    return this.links.list(merchantId, mode === 'live', parseLimit(limit), startingAfter);
  }

  @Post()
  @HttpCode(201)
  @RequireAction('paylinks:write')
  create(@Param('merchantId') merchantId: string, @Query('mode') mode: string | undefined, @Body() dto: CreatePaymentLinkDto, @Req() req: any) {
    return this.links.create(merchantId, mode === 'live', toInput(dto), userActor(req));
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequireAction('paylinks:write')
  deactivate(@Param('merchantId') merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Req() req: any) {
    return this.links.deactivate(merchantId, mode === 'live', id, userActor(req));
  }

  @Post(':id/send')
  @HttpCode(202)
  @RequireAction('paylinks:write')
  send(@Param('merchantId') merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Body() dto: SendPaymentLinkDto) {
    return this.links.send(merchantId, mode === 'live', id, dto.phone, dto.channel);
  }
}

/** Page de paiement hébergée : lecture et paiement d'un lien, sans compte (§M4). */
@ApiTags('Page de paiement (public)')
@Controller('v1/public/links')
export class PublicPaymentLinksController {
  constructor(private readonly links: PaymentLinksService) {}

  @Get(':code')
  view(@Param('code') code: string) {
    return this.links.publicView(code);
  }

  @Post(':code/pay')
  @HttpCode(201)
  pay(@Param('code') code: string, @Body() dto: PayLinkDto) {
    return this.links.pay(code, dto);
  }

  @Post(':code/pay-card')
  @HttpCode(201)
  payCard(@Param('code') code: string, @Body() dto: PayLinkCardDto) {
    return this.links.payCard(code, dto);
  }
}
