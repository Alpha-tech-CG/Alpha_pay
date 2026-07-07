import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { WalletJwtPayload } from './wallet-jwt.guard';

/**
 * À utiliser après WalletJwtGuard.
 * Restreint l'accès aux porteurs du rôle MERCHANT_CASHIER uniquement.
 */
@Injectable()
export class CashierRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const wallet: WalletJwtPayload | undefined = request.wallet;
    if (wallet?.role !== 'MERCHANT_CASHIER') {
      throw new ForbiddenException('Accès réservé aux caissiers');
    }
    return true;
  }
}
