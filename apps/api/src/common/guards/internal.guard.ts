import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * Protège les routes internes/ops (ex: vérification d'intégrité du grand
 * livre) avec un jeton statique distinct des clés API marchand.
 */
@Injectable()
export class InternalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-internal-token'];
    const expected = process.env.INTERNAL_API_TOKEN;

    if (!expected) throw new UnauthorizedException('INTERNAL_API_TOKEN non configuré');
    if (token !== expected) throw new UnauthorizedException('Jeton interne invalide');

    return true;
  }
}
