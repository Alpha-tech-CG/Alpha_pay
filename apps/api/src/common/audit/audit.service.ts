import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { createHash } from 'crypto';
import { PrismaClient } from '@paybrain/database';
import { logger } from '../logging/logger';

export interface AuditEntry {
  actorType: 'user' | 'staff' | 'api_key' | 'system';
  actorId?: string | null;
  merchantId?: string | null;
  /** Action sensible, ex. « auth.login_succeeded » (liste : docs/DECISIONS.md). */
  action: string;
  targetType?: string;
  targetId?: string | null;
  ip?: string | null;
  /** Contexte sans donnée personnelle ni secret. */
  metadata?: Record<string, unknown>;
}

/**
 * Journal d'audit non modifiable (§M12) : table en ajout seul (triggers
 * Postgres). L'IP est conservée hachée. Un échec d'écriture est journalisé
 * mais ne casse pas l'action métier.
 */
@Injectable()
export class AuditService {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          merchantId: entry.merchantId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          ipHash: entry.ip ? new Uint8Array(createHash('sha256').update(entry.ip).digest()) : null,
          metadata: (entry.metadata ?? {}) as object,
        },
      });
    } catch (err) {
      logger.error({ action: entry.action, err: (err as Error).message }, "Écriture du journal d'audit impossible");
    }
  }
}

@Global()
@Module({
  providers: [
    AuditService,
    Reflector,
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuditService],
})
export class AuditModule {}
