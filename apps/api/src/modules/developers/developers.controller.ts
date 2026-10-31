import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ANY_MODE, PrismaClient } from '@paybrain/database';
import { AuditService } from '../../common/audit/audit.service';
import { afterCursor, decodeCursor, page, parseLimit } from '../../common/pagination/cursor';
import { apiKeyRateLimit } from '../../common/security/api-usage';
import { ApiKeysService } from '../api-keys/api-keys.service';
import { ModuleAccessGuard, RequireModule } from '../billing/module-access.guard';
import { CreateApiKeyDto } from '../api-keys/dto/create-api-key.dto';
import { SessionGuard } from '../auth/session.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { CreateWebhookEndpointDto, UpdateWebhookEndpointDto, WEBHOOK_EVENTS } from '../webhooks-out/dto/create-webhook-endpoint.dto';
import { WebhookEndpointsService } from '../webhooks-out/webhook-endpoints.service';

/** Durée de conservation du journal des requêtes API (§M10). */
export const API_LOG_RETENTION_DAYS = 30;

@Injectable()
export class ApiLogsPurge {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  /** Idempotent : peut tourner sur plusieurs instances. */
  @Cron(CronExpression.EVERY_HOUR)
  async purge(now = new Date()): Promise<number> {
    const res = await this.prisma.apiRequestLog.deleteMany({
      where: { livemode: ANY_MODE, createdAt: { lt: new Date(now.getTime() - API_LOG_RETENTION_DAYS * 86_400_000) } },
    });
    return res.count;
  }
}

const isLive = (mode?: string) => mode === 'live';

/**
 * Espace Développeurs du tableau de bord (T-56, T-57) : clés API (secret
 * affiché une seule fois), journal des requêtes, endpoints webhook, journal des
 * livraisons et renvoi. Propriétaire, administrateurs et développeurs.
 * Les clés API restent ouvertes à tous les paliers (l'API de paiement fait partie
 * d'Encaisser) ; journal et webhooks relèvent du module payant M10 (§M11).
 */
@ApiTags('Développeurs (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard, ModuleAccessGuard)
export class DevelopersController {
  constructor(
    @Inject('PRISMA') private readonly prisma: PrismaClient,
    private readonly apiKeys: ApiKeysService,
    private readonly endpoints: WebhookEndpointsService,
    private readonly audit: AuditService,
  ) {}

  private record(req: any, action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>) {
    return this.audit.record({ actorType: 'user', actorId: req.appUser.id, merchantId: req.membership.merchantId, action, targetType, targetId, ip: req.ip, metadata });
  }

  // ─── Clés API ────────────────────────────────────────────────────────────

  @Get('api-keys')
  @RequireAction('apikeys:write')
  async listKeys(@Param('merchantId') merchantId: string) {
    return { data: await this.apiKeys.list(merchantId), rate_limit_per_minute: apiKeyRateLimit() };
  }

  @Post('api-keys')
  @HttpCode(201)
  @RequireAction('apikeys:write')
  @ApiOperation({ summary: 'Créer une clé (le secret n’est affiché qu’une seule fois)' })
  async createKey(@Param('merchantId') merchantId: string, @Body() dto: CreateApiKeyDto, @Req() req: any) {
    const key = await this.apiKeys.create(merchantId, dto);
    await this.record(req, 'developers.api_key_created', 'api_key', key.id, { mode: key.mode });
    return key;
  }

  @Post('api-keys/:id/rotate')
  @HttpCode(201)
  @RequireAction('apikeys:write')
  async rotateKey(@Param('merchantId') merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const key = await this.apiKeys.rotate(merchantId, id);
    await this.record(req, 'developers.api_key_rotated', 'api_key', id, { replacedBy: key.id });
    return key;
  }

  @Delete('api-keys/:id')
  @RequireAction('apikeys:write')
  async revokeKey(@Param('merchantId') merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const res = await this.apiKeys.revoke(merchantId, id);
    await this.record(req, 'developers.api_key_revoked', 'api_key', id);
    return res;
  }

  // ─── Journal des requêtes API (30 jours) ────────────────────────────────

  @Get('api-logs')
  @RequireModule('m10_developers')
  @RequireAction('apilogs:view')
  async logs(
    @Param('merchantId') merchantId: string,
    @Query('mode') mode?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
  ) {
    const n = parseLimit(limit, 50);
    const statusFilter = status === 'errors' ? { status: { gte: 400 } } : status === 'ok' ? { status: { lt: 400 } } : {};
    const rows = await this.prisma.apiRequestLog.findMany({
      where: { merchantId, livemode: isLive(mode), ...statusFilter, ...afterCursor(decodeCursor(startingAfter)) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: n + 1,
    });
    return {
      ...page(rows, n, (r) => ({
        id: r.id,
        method: r.method,
        path: r.path,
        status: r.status,
        duration_ms: r.durationMs,
        error_code: r.errorCode,
        request_id: r.requestId,
        api_key_id: r.apiKeyId,
        created_at: r.createdAt,
      })),
      retention_days: API_LOG_RETENTION_DAYS,
    };
  }

  // ─── Webhooks ────────────────────────────────────────────────────────────

  @Get('webhook-endpoints')
  @RequireModule('m10_developers')
  @RequireAction('webhooks:write')
  async listEndpoints(@Param('merchantId') merchantId: string, @Query('mode') mode?: string) {
    return { data: await this.endpoints.list(merchantId, isLive(mode)), events: WEBHOOK_EVENTS };
  }

  @Post('webhook-endpoints')
  @RequireModule('m10_developers')
  @HttpCode(201)
  @RequireAction('webhooks:write')
  async createEndpoint(@Param('merchantId') merchantId: string, @Query('mode') mode: string | undefined, @Body() dto: CreateWebhookEndpointDto, @Req() req: any) {
    const endpoint = await this.endpoints.create(merchantId, isLive(mode), dto);
    await this.record(req, 'developers.webhook_endpoint_created', 'webhook_endpoint', endpoint.id, { livemode: isLive(mode) });
    return endpoint;
  }

  @Patch('webhook-endpoints/:id')
  @RequireModule('m10_developers')
  @RequireAction('webhooks:write')
  async updateEndpoint(
    @Param('merchantId') merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('mode') mode: string | undefined,
    @Body() dto: UpdateWebhookEndpointDto,
    @Req() req: any,
  ) {
    const endpoint = await this.endpoints.update(merchantId, isLive(mode), id, dto);
    await this.record(req, 'developers.webhook_endpoint_updated', 'webhook_endpoint', id);
    return endpoint;
  }

  @Delete('webhook-endpoints/:id')
  @RequireModule('m10_developers')
  @RequireAction('webhooks:write')
  async deleteEndpoint(@Param('merchantId') merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Req() req: any) {
    const res = await this.endpoints.remove(merchantId, isLive(mode), id);
    await this.record(req, 'developers.webhook_endpoint_deleted', 'webhook_endpoint', id);
    return res;
  }

  @Get('webhook-endpoints/:id/deliveries')
  @RequireModule('m10_developers')
  @RequireAction('webhooks:write')
  async deliveries(@Param('merchantId') merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Query('mode') mode?: string) {
    return { data: await this.endpoints.deliveries(merchantId, isLive(mode), id) };
  }

  @Post('webhook-endpoints/:id/deliveries/:deliveryId/resend')
  @RequireModule('m10_developers')
  @HttpCode(200)
  @RequireAction('webhooks:write')
  async resend(
    @Param('merchantId') merchantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Query('mode') mode: string | undefined,
    @Req() req: any,
  ) {
    const res = await this.endpoints.resend(merchantId, isLive(mode), id, deliveryId);
    await this.record(req, 'developers.webhook_resent', 'webhook_delivery', deliveryId, { ok: res.ok });
    return res;
  }

  @Post('webhook-endpoints/:id/test')
  @RequireModule('m10_developers')
  @HttpCode(200)
  @RequireAction('webhooks:write')
  test(@Param('merchantId') merchantId: string, @Param('id', ParseUUIDPipe) id: string, @Query('mode') mode?: string) {
    return this.endpoints.test(merchantId, isLive(mode), id);
  }
}
