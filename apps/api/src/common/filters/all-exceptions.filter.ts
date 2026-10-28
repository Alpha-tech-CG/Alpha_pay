import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { defaultCodeFor } from '../errors/api-error';
import { logger } from '../logging/logger';
import { currentRequestId } from '../logging/request-context';

const JSON_PARSE_SIGNATURE = /in JSON|Unexpected token|Expected (?:property name|double-quoted|',')|Unterminated string/i;

/** Détecte une erreur de parsing JSON, brute (body-parser) ou enveloppée. */
function isJsonParseError(exception: unknown): boolean {
  if ((exception as any)?.type === 'entity.parse.failed') return true;
  if (exception instanceof HttpException && exception.getStatus() === HttpStatus.BAD_REQUEST) {
    const resp = exception.getResponse() as any;
    const message = typeof resp === 'string' ? resp : resp?.message;
    return typeof message === 'string' && JSON_PARSE_SIGNATURE.test(message);
  }
  return false;
}

/** Extrait code, message et champ d'une réponse d'exception Nest ou applicative. */
function describe4xx(exception: HttpException, status: number): { code: string; message: string; param?: string } {
  const resp = exception.getResponse() as any;
  if (typeof resp === 'string') return { code: defaultCodeFor(status), message: resp };
  const raw = Array.isArray(resp?.message) ? resp.message[0] : resp?.message;
  const message = typeof raw === 'string' && raw ? raw : exception.message;
  const code = typeof resp?.code === 'string' ? resp.code : defaultCodeFor(status);
  return typeof resp?.param === 'string' ? { code, message, param: resp.param } : { code, message };
}

/**
 * Filtre d'exception global (ALP-154, §7).
 *
 * Toutes les erreurs sortent au format `{ error: { code, message, param?, request_id } }`.
 * Un client ne reçoit JAMAIS `error.message` brut sur une erreur serveur
 * (chaîne DB, ECONNREFUSED, stack…) : les 5xx sont masqués derrière un code
 * public + un `request_id` corrélable au journal serveur. Les 4xx volontaires
 * gardent leur message, déjà sûr et utile à l'appelant.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // Une réponse a déjà été émise (ex. garde webhook qui termine en 401 vide) :
    // ne pas tenter d'écrire une seconde fois.
    if (res.headersSent) return;

    const requestId = currentRequestId() ?? (req as any).id ?? 'inconnu';
    res.setHeader('X-Request-Id', requestId);

    // JSON malformé (body-parser) : 400 générique, sans fuiter le message du
    // parser (position, structure attendue) — cf. ALP-154/ALP-159.
    if (isJsonParseError(exception)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        error: { code: 'json_invalide', message: 'Le corps de la requête n’est pas un JSON valide.', request_id: requestId },
      });
      return;
    }

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException && status < 500) {
      const error = describe4xx(exception, status);
      (res.locals ??= {}).errorCode = error.code; // repris par le journal des requêtes API (T-56)
      res.status(status).json({ error: { ...error, request_id: requestId } });
      return;
    }

    // 5xx (ou exception non-HTTP) : on masque. Journal complet côté serveur,
    // réponse minimale côté client.
    const publicCode =
      (exception as any)?.publicCode ??
      (status === HttpStatus.BAD_GATEWAY || status === HttpStatus.SERVICE_UNAVAILABLE ? 'fournisseur_indisponible' : 'erreur_interne');

    logger.error(
      {
        method: req.method,
        path: req.originalUrl ?? req.url,
        status,
        err: exception instanceof Error ? { message: exception.message, stack: exception.stack } : String(exception),
      },
      'Erreur serveur',
    );

    (res.locals ??= {}).errorCode = publicCode;
    res.status(status).json({
      error: { code: publicCode, message: 'Une erreur est survenue. Réessayez plus tard.', request_id: requestId },
    });
  }
}
