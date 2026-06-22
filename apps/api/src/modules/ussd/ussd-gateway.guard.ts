import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { isIpAllowed, parseIpAllowlist } from '../../common/security/ip-allowlist';

/**
 * Restreint l'endpoint USSD à l'IP de la passerelle (agrégateur USSD), défense
 * en profondeur (charte Périmètre). No-op si USSD_GATEWAY_IP_ALLOWLIST n'est pas
 * configuré (dev/sandbox) ; sinon une IP hors liste → 403 corps vide.
 */
@Injectable()
export class UssdGatewayGuard implements CanActivate {
  private readonly logger = new Logger(UssdGatewayGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const allowlist = parseIpAllowlist(process.env.USSD_GATEWAY_IP_ALLOWLIST);
    if (allowlist.length === 0) return true;

    const ip = req.ip ?? req.socket?.remoteAddress ?? '';
    if (isIpAllowed(ip, allowlist)) return true;

    this.logger.warn(`USSD bloqué : IP ${ip} hors allowlist`);
    res.status(403).end();
    return false;
  }
}
