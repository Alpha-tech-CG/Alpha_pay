import { CallHandler, ExecutionContext, Injectable, NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';

export const AUDIT_ACTION_KEY = 'audit_action';

/** Décorateur : marque un handler pour journalisation automatique. */
export const AuditAction = (action: string, targetType?: string) =>
  SetMetadata(AUDIT_ACTION_KEY, { action, targetType });

/**
 * Intercepteur global d'audit (T-94).
 * Enregistre l'action après succès. N'est déclenché que si @AuditAction est présent.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<{ action: string; targetType?: string }>(
      AUDIT_ACTION_KEY,
      ctx.getHandler(),
    );

    if (!meta) return next.handle();

    const req = ctx.switchToHttp().getRequest<any>();

    return next.handle().pipe(
      tap(() => {
        const actorType: 'user' | 'staff' | 'api_key' | 'system' =
          req.staffUser ? 'staff'
          : req.appUser ? 'user'
          : req.apiKey ? 'api_key'
          : 'system';

        const actorId =
          req.staffUser?.staffId ?? req.appUser?.id ?? req.apiKey?.id ?? null;

        const merchantId =
          req.params?.merchantId ?? req.membership?.merchantId ?? null;

        const targetId =
          req.params?.id ?? req.params?.merchantId ?? null;

        void this.audit.record({
          actorType,
          actorId,
          merchantId,
          action: meta.action,
          targetType: meta.targetType,
          targetId,
          ip: req.ip,
        });
      }),
    );
  }
}
