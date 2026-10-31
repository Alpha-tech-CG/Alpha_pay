import { CanActivate, ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../common/errors/api-error';
import { BillingService, MODULE_KEYS, ModuleKey } from './billing.service';

export const MODULE_KEY = 'alphapay_module';

/** Module payant requis par un contrôleur ou une route (§M11). */
export const RequireModule = (module: ModuleKey) => SetMetadata(MODULE_KEY, module);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Contrôle d'accès par palier, CÔTÉ SERVEUR (§M11) : un module non inclus est
 * refusé (`403 module_non_inclus`, invitation à changer de palier) ; un marchand
 * en lecture seule (impayé après la grâce) garde la lecture. Ne s'applique
 * jamais aux encaissements : ces routes ne portent pas @RequireModule.
 * À placer après RequireMemberGuard (req.membership) ou ApiKeyGuard (req.merchant).
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billing: BillingService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const module = this.reflector.getAllAndOverride<ModuleKey | undefined>(MODULE_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!module) return true;
    const req = ctx.switchToHttp().getRequest();
    const merchantId = req.membership?.merchantId ?? req.merchant?.id;
    if (!merchantId) return true;
    const access = await this.billing.checkModuleAccess(merchantId, module);
    if (!access.allowed) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'module_non_inclus', `Le module ${MODULE_KEYS[module]} n'est pas inclus dans votre palier : changez de palier pour y accéder`);
    }
    if (access.readonly && !READ_METHODS.has(req.method)) {
      throw new ApiError(HttpStatus.FORBIDDEN, 'lecture_seule', 'Abonnement AlphaPay impayé : ce module est en lecture seule. Vos encaissements continuent normalement.');
    }
    return true;
  }
}
