import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { safeEqual } from '../../common/security/hmac';

@Injectable()
export class SmileWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const expected = process.env.SMILE_WEBHOOK_SECRET;
    const supplied = context.switchToHttp().getRequest().headers['x-smile-signature'];
    if (!expected || typeof supplied !== 'string') throw new UnauthorizedException('Signature Smile absente');
    // safeEqual masque la différence de longueur (pas de fuite timing sur la taille du secret).
    if (!safeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new UnauthorizedException('Signature Smile invalide');
    }
    return true;
  }
}
