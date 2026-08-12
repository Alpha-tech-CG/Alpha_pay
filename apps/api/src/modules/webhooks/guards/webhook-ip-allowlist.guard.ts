import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Operator } from '@paybrain/shared';
import { isIpAllowed, parseIpAllowlist } from '../../../common/security/ip-allowlist';

/**
 * Webhook IP allowlist (ALP-160), defense in depth before HMAC verification.
 * In production, a missing allowlist blocks the callback instead of silently
 * removing this protection through bad configuration.
 */
@Injectable()
export class WebhookIpAllowlistGuard implements CanActivate {
  private readonly logger = new Logger(WebhookIpAllowlistGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const operator: Operator = String(req.params?.operator ?? '').toUpperCase() === 'AIRTEL' ? 'AIRTEL' : 'MTN';

    const allowlist = parseIpAllowlist(
      operator === 'AIRTEL'
        ? process.env.AIRTEL_WEBHOOK_IP_ALLOWLIST
        : process.env.MTN_WEBHOOK_IP_ALLOWLIST,
    );

    if (allowlist.length === 0) {
      if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_WEBHOOK_IP_ALLOWLIST === 'true') {
        this.logger.error(`Webhook ${operator} rejected: IP allowlist is not configured`);
        res.status(403).end();
        return false;
      }
      return true;
    }

    const clientIp = req.ip ?? req.socket?.remoteAddress ?? '';
    if (isIpAllowed(clientIp, allowlist)) return true;

    this.logger.warn(`Webhook ${operator} blocked: IP ${clientIp} is outside allowlist`);
    res.status(403).end();
    return false;
  }
}
