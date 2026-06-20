import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class SmileWebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const expected = process.env.SMILE_WEBHOOK_SECRET;
    const supplied = context.switchToHttp().getRequest().headers['x-smile-signature'];
    if (!expected || typeof supplied !== 'string') throw new UnauthorizedException('Signature Smile absente');
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new UnauthorizedException('Signature Smile invalide');
    return true;
  }
}
