import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaClient } from '@paybrain/database';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCK_MS = 30_000;
const TTL_HOURS = 24;

/** Sérialisation canonique (clés triées) pour un hash de body stable. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}';
}

function hashCanonical(body: unknown): Buffer {
  return createHash('sha256').update(stableStringify(body ?? {}), 'utf8').digest();
}

/**
 * Idempotence sur les requêtes mutantes (ALP-156).
 *
 * Garantit qu'un POST /payments rejoué (timeout marchand, retry réseau, requêtes
 * parallèles) ne déclenche qu'UN SEUL appel opérateur — pas de double débit.
 *
 * - Header `Idempotency-Key` (UUID v4) obligatoire → sinon 400.
 * - Même clé + même body → réponse mémorisée rejouée (header `Idempotency-Replayed: true`).
 * - Même clé + body différent → 422 `idempotency_collision`.
 * - Requête concurrente encore verrouillée → 409 `request_in_progress`.
 *
 * L'atomicité repose sur la contrainte unique (merchant_id, idempotency_key, endpoint) :
 * 100 requêtes parallèles → une seule gagne l'INSERT, les autres tombent en conflit.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const key = req.headers['idempotency-key'];
    if (!key || typeof key !== 'string' || !UUID_RE.test(key)) {
      throw new BadRequestException({
        code: 'idempotency_key_required',
        message: 'Header Idempotency-Key (UUID v4) requis.',
      });
    }

    const merchantId = req.merchant?.id;
    if (!merchantId) {
      // Ne devrait pas arriver (ApiKeyGuard tourne avant), mais on ne crée pas
      // d'enregistrement d'idempotence sans propriétaire.
      throw new BadRequestException({ code: 'merchant_context_missing' });
    }

    const endpoint = `${req.method} ${req.route?.path ?? req.path}`;
    const requestHash = hashCanonical(req.body);
    const now = Date.now();

    let isFirstAttempt = false;
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          merchantId,
          idempotencyKey: key,
          endpoint,
          requestHash: new Uint8Array(requestHash),
          lockedUntil: new Date(now + LOCK_MS),
          expiresAt: new Date(now + TTL_HOURS * 3_600_000),
        },
      });
      isFirstAttempt = true;
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;

      // Conflit : un enregistrement existe déjà pour cette clé.
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: {
          merchantId_idempotencyKey_endpoint: { merchantId, idempotencyKey: key, endpoint },
        },
      });

      if (!existing) {
        // Course extrêmement rare (TTL purge entre create et read) : on retente net.
        throw new ConflictException({ code: 'idempotency_record_inconsistent' });
      }

      // Body différent pour la même clé → l'appelant réutilise la clé à tort.
      if (!Buffer.from(existing.requestHash).equals(requestHash)) {
        throw new UnprocessableEntityException({
          code: 'idempotency_collision',
          message: 'Idempotency-Key réutilisée avec un body différent.',
        });
      }

      // Réponse déjà calculée → on la rejoue à l'identique.
      if (existing.responseStatus != null) {
        res.setHeader('Idempotency-Replayed', 'true');
        res.status(existing.responseStatus);
        return of(existing.responseBody);
      }

      // Toujours verrouillée par une requête concurrente en cours.
      if (existing.lockedUntil && existing.lockedUntil.getTime() > now) {
        throw new ConflictException({
          code: 'request_in_progress',
          message: 'Une requête avec cette Idempotency-Key est déjà en cours.',
        });
      }

      // Verrou expiré sans réponse (crash applicatif au milieu) : on reprend la
      // main en re-verrouillant, ce qui satisfait « le verrou expire après 30s ».
      await this.prisma.idempotencyRecord.update({
        where: {
          merchantId_idempotencyKey_endpoint: { merchantId, idempotencyKey: key, endpoint },
        },
        data: { lockedUntil: new Date(now + LOCK_MS) },
      });
      isFirstAttempt = true;
    }

    if (!isFirstAttempt) {
      // Inatteignable : tous les chemins de conflit retournent ou lèvent plus haut.
      throw new ConflictException({ code: 'idempotency_unexpected_state' });
    }

    return next.handle().pipe(
      tap({
        next: async (body) => {
          await this.persistResponse(merchantId, key, endpoint, res.statusCode ?? 201, body);
        },
        error: async () => {
          // Échec (validation 400, exception métier…) : rien de durable n'a eu lieu.
          // On SUPPRIME l'enregistrement pour ne pas « brûler » la clé — un retry,
          // y compris avec un body corrigé, ne doit pas tomber en collision 422.
          await this.deleteRecord(merchantId, key, endpoint);
        },
      }),
    );
  }

  private async persistResponse(
    merchantId: string,
    key: string,
    endpoint: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    await this.prisma.idempotencyRecord
      .update({
        where: { merchantId_idempotencyKey_endpoint: { merchantId, idempotencyKey: key, endpoint } },
        data: { responseStatus: status, responseBody: body as any, lockedUntil: null },
      })
      .catch(() => undefined);
  }

  private async deleteRecord(merchantId: string, key: string, endpoint: string): Promise<void> {
    await this.prisma.idempotencyRecord
      .delete({
        where: { merchantId_idempotencyKey_endpoint: { merchantId, idempotencyKey: key, endpoint } },
      })
      .catch(() => undefined);
  }
}
