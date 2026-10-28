import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { BillingService, ModuleKey } from './billing.service';

@Controller('v1/merchants/:merchantId/billing')
@UseGuards(SessionGuard, RequireMemberGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // ─── Plans ─────────────────────────────────────────────────────────────────

  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
  }

  // ─── Abonnement ────────────────────────────────────────────────────────────

  @Get('subscription')
  getSubscription(@Param('merchantId') _mid: string, @Req() req: any) {
    const { merchantId } = req.membership;
    return this.billing.getSubscription(merchantId);
  }

  @Post('subscribe')
  subscribe(@Param('merchantId') _mid: string, @Req() req: any, @Body() body: { plan: string }) {
    const { merchantId } = req.membership;
    return this.billing.subscribe(merchantId, body.plan);
  }

  @Post('cancel')
  cancel(@Param('merchantId') _mid: string, @Req() req: any) {
    const { merchantId } = req.membership;
    return this.billing.cancelSubscription(merchantId);
  }

  // ─── Crédits ───────────────────────────────────────────────────────────────

  @Get('credits')
  async getCredits(@Param('merchantId') _mid: string, @Req() req: any) {
    const { merchantId } = req.membership;
    const balance = await this.billing.getBalance(merchantId);
    return { balance };
  }

  @Get('credits/packs')
  listPacks() {
    return this.billing.listCreditPacks();
  }

  @Post('credits/purchase')
  purchasePack(
    @Param('merchantId') _mid: string,
    @Req() req: any,
    @Body() body: { pack: string },
  ) {
    const { merchantId } = req.membership;
    return this.billing.purchasePack(merchantId, body.pack);
  }

  // ─── Contrôle d'accès (T-83) ──────────────────────────────────────────────

  @Get('modules/:key/access')
  checkAccess(
    @Param('merchantId') _mid: string,
    @Param('key') key: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.billing.checkModuleAccess(merchantId, key as ModuleKey);
  }

  // ─── Factures AlphaPay ─────────────────────────────────────────────────────

  @Get('invoices')
  listInvoices(@Param('merchantId') _mid: string, @Req() req: any) {
    const { merchantId } = req.membership;
    return this.billing.listInvoices(merchantId);
  }
}
