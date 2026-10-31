import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../../common/audit/audit.service';
import { RequireStaffRole, STAFF_WRITE, StaffGuard } from '../staff/staff.guard';
import { SupportService } from './support.service';

class ReasonDto {
  @IsString() @MinLength(3, { message: 'motif obligatoire' }) @MaxLength(500) reason!: string;
}

class NoteDto {
  @IsString() @MinLength(3) @MaxLength(2000) text!: string;
}

class EndpointStatusDto extends ReasonDto {
  @IsBoolean() active!: boolean;
}

/**
 * Assistance et service développeur (§M12) : lecture pour tous les agents ;
 * gestes de dépannage sans effet sur la configuration du client (relance
 * opérateur, renvoi de webhook, note) ouverts au Support ; gestes de sécurité
 * (révoquer une clé, couper un endpoint, déconnecter un membre) réservés à la
 * Conformité et au super-administrateur ; files de tâches au super-administrateur.
 * Chaque geste est motivé et inscrit au journal d'audit.
 */
@ApiExcludeController()
@Controller('internal/support')
@UseGuards(StaffGuard)
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly auditLog: AuditService,
  ) {}

  private record(req: any, action: string, merchantId: string | null, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
    return this.auditLog.record({ actorType: 'staff', actorId: req.staffUser.staffId, merchantId, action, targetType, targetId, ip: req.ip, metadata });
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  @Get('search')
  search(@Query('q') q = '') {
    return this.support.search(q);
  }

  @Get('payments/:id')
  payment(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.payment(id);
  }

  @Get('merchants/:merchantId/payments')
  async merchantPayments(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Query('status') status?: string,
    @Query('mode') mode?: string,
    @Query('cursor') cursor?: string,
  ) {
    await this.support.assertMerchant(merchantId);
    return this.support.merchantPayments(merchantId, { status, mode, cursor });
  }

  @Get('merchants/:merchantId/developers')
  async developers(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    await this.support.assertMerchant(merchantId);
    return this.support.developers(merchantId);
  }

  @Get('merchants/:merchantId/messages')
  async messages(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    await this.support.assertMerchant(merchantId);
    return this.support.messages(merchantId);
  }

  @Get('merchants/:merchantId/team')
  async team(@Param('merchantId', ParseUUIDPipe) merchantId: string) {
    await this.support.assertMerchant(merchantId);
    return this.support.team(merchantId);
  }

  @Get('merchants/:merchantId/audit')
  async merchantAudit(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Query('cursor') cursor?: string) {
    await this.support.assertMerchant(merchantId);
    return this.support.audit({ merchantId, cursor });
  }

  @Get('audit')
  audit(@Query('action') action?: string, @Query('actor_type') actorType?: string, @Query('merchant_id') merchantId?: string, @Query('cursor') cursor?: string) {
    return this.support.audit({ action, actorType, merchantId, cursor });
  }

  @Get('system')
  system() {
    return this.support.system();
  }

  // ─── Dépannage (Support et au-delà) ───────────────────────────────────────

  @Post('payments/:id/refresh')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.support)
  async refresh(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const result = await this.support.refreshPayment(id);
    const p = await this.support.payment(id);
    await this.record(req, 'support.payment_refreshed', p.merchant_id, 'transaction', id, result);
    return result;
  }

  @Post('outbox/:id/requeue')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.support)
  async requeue(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto, @Req() req: any) {
    const result = await this.support.requeueOutbox(id);
    const p = await this.support.payment(result.transaction_id);
    await this.record(req, 'support.operator_request_requeued', p.merchant_id, 'outbox_event', id, { reason: body.reason });
    return result;
  }

  @Post('deliveries/:id/resend')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.support)
  async resend(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const { merchantId, result } = await this.support.resendDelivery(id);
    await this.record(req, 'support.webhook_resent', merchantId, 'webhook_delivery', id, { ok: result.ok, status: result.status });
    return result;
  }

  @Post('merchants/:merchantId/webhook-endpoints/:endpointId/test')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.support)
  async testEndpoint(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('endpointId', ParseUUIDPipe) endpointId: string, @Req() req: any) {
    const result = await this.support.testEndpoint(merchantId, endpointId);
    await this.record(req, 'support.webhook_tested', merchantId, 'webhook_endpoint', endpointId, { ok: result.ok, status: result.status });
    return result;
  }

  /** Note interne d'assistance (appel du client, diagnostic) : visible dans le journal du marchand. */
  @Post('merchants/:merchantId/notes')
  @HttpCode(201)
  @RequireStaffRole(...STAFF_WRITE.support)
  async note(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Body() body: NoteDto, @Req() req: any) {
    await this.support.assertMerchant(merchantId);
    await this.record(req, 'support.note', merchantId, 'merchant', merchantId, { text: body.text });
    return { ok: true };
  }

  // ─── Sécurité (Conformité, super-administrateur) ──────────────────────────

  @Post('merchants/:merchantId/api-keys/:keyId/revoke')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.compliance)
  async revokeKey(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('keyId', ParseUUIDPipe) keyId: string, @Body() body: ReasonDto, @Req() req: any) {
    const result = await this.support.revokeKey(merchantId, keyId);
    await this.record(req, 'support.api_key_revoked', merchantId, 'api_key', keyId, { reason: body.reason });
    return result;
  }

  @Post('merchants/:merchantId/webhook-endpoints/:endpointId/status')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.compliance)
  async endpointStatus(
    @Param('merchantId', ParseUUIDPipe) merchantId: string,
    @Param('endpointId', ParseUUIDPipe) endpointId: string,
    @Body() body: EndpointStatusDto,
    @Req() req: any,
  ) {
    const result = await this.support.setEndpointStatus(merchantId, endpointId, body.active);
    await this.record(req, body.active ? 'support.webhook_endpoint_enabled' : 'support.webhook_endpoint_disabled', merchantId, 'webhook_endpoint', endpointId, { reason: body.reason });
    return result;
  }

  @Post('merchants/:merchantId/members/:memberId/sessions/revoke')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.compliance)
  async revokeSessions(@Param('merchantId', ParseUUIDPipe) merchantId: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body() body: ReasonDto, @Req() req: any) {
    const { revoked } = await this.support.revokeMemberSessions(merchantId, memberId);
    await this.record(req, 'support.member_sessions_revoked', merchantId, 'merchant_member', memberId, { reason: body.reason, revoked });
    return { revoked };
  }

  // ─── Plateforme (super-administrateur) ────────────────────────────────────

  @Post('system/queues/:queue/retry')
  @HttpCode(200)
  @RequireStaffRole(...STAFF_WRITE.admin)
  async retryQueue(@Param('queue') queue: string, @Body() body: ReasonDto, @Req() req: any) {
    const retried = await this.support.retryQueue(queue);
    await this.record(req, 'support.queue_retried', null, 'queue', queue, { reason: body.reason, retried });
    return { retried };
  }
}
