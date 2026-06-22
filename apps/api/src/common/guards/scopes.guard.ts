import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/scopes.decorator';

/**
 * Applique les scopes des clés API (ALP-VULN).
 *
 * Doit s'exécuter APRÈS ApiKeyGuard, qui pose `request.apiKeyScopes`.
 *
 * Modèle :
 *  - une clé SANS scope (tableau vide) = accès complet (clés héritées / par défaut) ;
 *  - une clé AVEC scopes = restreinte : elle doit porter TOUS les scopes exigés
 *    par la route, sinon 403.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const granted: string[] = request.apiKeyScopes ?? [];
    // Clé non restreinte (aucun scope déclaré) → accès complet, rétrocompatible.
    if (granted.length === 0) return true;

    const ok = required.every((scope) => granted.includes(scope));
    if (!ok) {
      throw new ForbiddenException({
        code: 'insufficient_scope',
        message: `Scope requis : ${required.join(', ')}`,
      });
    }
    return true;
  }
}
