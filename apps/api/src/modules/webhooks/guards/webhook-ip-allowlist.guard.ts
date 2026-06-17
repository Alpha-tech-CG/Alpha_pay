import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Operator } from '@paybrain/shared';
import { isIpAllowed, parseIpAllowlist } from '../../../common/security/ip-allowlist';

/**
 * Allowlist d'IP applicative pour les webhooks (ALP-160), défense en profondeur.
 *
 * No-op si aucune allowlist n'est configurée (dev/sandbox) — le filtrage
 * autoritatif reste au WAF. Si `MTN_WEBHOOK_IP_ALLOWLIST` /
 * `AIRTEL_WEBHOOK_IP_ALLOWLIST` est défini, une IP hors liste → 403 corps vide.
 *
 * Cette garde s'exécute AVANT la vérification HMAC : inutile de faire le travail
 * cryptographique pour une source déjà hors périmètre.
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
    if (allowlist.length === 0) return true; // pas de restriction configurée

    const clientIp = req.ip ?? req.socket?.remoteAddress ?? '';
    if (isIpAllowed(clientIp, allowlist)) return true;

    this.logger.warn(`Webhook ${operator} bloqué : IP ${clientIp} hors allowlist`);
    res.status(403).end();
    return false;
  }
}
