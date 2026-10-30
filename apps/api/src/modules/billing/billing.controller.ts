import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { SessionGuard } from '../auth/session.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { BillingService, MODULE_KEYS, ModuleKey } from './billing.service';

class SubscribeDto {
  @IsString() @MaxLength(40) plan!: string;
}

class PurchaseDto {
  @IsString() @MaxLength(40) pack!: string;
}

/** Facturation AlphaPay vue par le marchand (§M11) : lecture pour l'équipe, achats par le propriétaire. */
@ApiTags('Facturation AlphaPay')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/billing')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @Get('subscription')
  getSubscription(@Req() req: any) {
    return this.billing.getSubscription(req.membership.merchantId);
  }

  @Post('subscribe')
  @HttpCode(200)
  @RequireAction('billing:manage')
  subscribe(@Body() body: SubscribeDto, @Req() req: any) {
    return this.billing.subscribe(req.membership.merchantId, body.plan, req.appUser.id);
  }

  @Post('cancel')
  @HttpCode(200)
  @RequireAction('billing:manage')
  cancel(@Req() req: any) {
    return this.billing.cancelSubscription(req.membership.merchantId, req.appUser.id);
  }

  @Get('credits')
  async getCredits(@Req() req: any) {
    return { balance: await this.billing.getBalance(req.membership.merchantId) };
  }

  @Get('credits/packs')
  listPacks() {
    return this.billing.listCreditPacks();
  }

  @Post('credits/purchase')
  @HttpCode(200)
  @RequireAction('billing:manage')
  purchasePack(@Body() body: PurchaseDto, @Req() req: any) {
    return this.billing.purchasePack(req.membership.merchantId, body.pack, req.appUser.id);
  }

  /** État des modules pour l'interface : verrouillé visible, lecture seule (§M11). */
  @Get('modules')
  async modules(@Req() req: any) {
    const keys = Object.keys(MODULE_KEYS) as ModuleKey[];
    const states = await Promise.all(keys.map((k) => this.billing.checkModuleAccess(req.membership.merchantId, k)));
    return { data: keys.map((k, i) => ({ key: k, label: MODULE_KEYS[k], ...states[i] })) };
  }

  @Get('modules/:key/access')
  checkAccess(@Param('key') key: string, @Req() req: any) {
    if (!(key in MODULE_KEYS)) return { allowed: false, readonly: false, plan: null };
    return this.billing.checkModuleAccess(req.membership.merchantId, key as ModuleKey);
  }

  @Get('invoices')
  listInvoices(@Req() req: any) {
    return this.billing.listInvoices(req.membership.merchantId);
  }
}
