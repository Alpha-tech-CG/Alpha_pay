import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { safeEqual } from '../security/hmac';

/**
 * Protège les routes internes/ops (ex: vérification d'intégrité du grand
 * livre) avec un jeton statique distinct des clés API marchand.
 *
 * Comparaison à temps constant (ALP-162) : un `!==` permettrait d'inférer le
 * jeton caractère par caractère par mesure du temps de réponse.
 */
@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-internal-token'];
    const expected = process.env.INTERNAL_API_TOKEN;

    if (!expected) throw new UnauthorizedException('INTERNAL_API_TOKEN non configuré');
    if (typeof token !== 'string' || !safeEqual(Buffer.from(token), Buffer.from(expected))) {
      throw new UnauthorizedException('Jeton interne invalide');
    }

    return true;
  }
}
