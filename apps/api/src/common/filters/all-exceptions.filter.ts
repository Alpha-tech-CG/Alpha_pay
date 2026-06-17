import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

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

/**
 * Filtre d'exception global (ALP-154).
 *
 * Principe : un client ne doit JAMAIS recevoir `error.message` brut sur une
 * erreur serveur (chaîne DB, ECONNREFUSED, stack, version de lib…). Les 5xx
 * sont masqués derrière un code public + un `request_id` corrélable au log
 * serveur structuré. Les 4xx volontaires (validation, auth, not found) sont
 * laissés intacts car leurs messages sont déjà sûrs et utiles à l'appelant.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    // Une réponse a déjà été émise (ex. garde webhook qui termine en 401 vide) :
    // ne pas tenter d'écrire une seconde fois.
    if (res.headersSent) return;

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', requestId);

    // JSON malformé (body-parser) : 400 générique, sans fuiter le message du
    // parser (position, structure attendue) — cf. ALP-154/ALP-159. Selon la
    // version, l'erreur arrive soit brute (type entity.parse.failed), soit
    // déjà enveloppée en BadRequestException dont le message expose le détail.
    if (isJsonParseError(exception)) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: { code: 'invalid_json', request_id: requestId } });
      return;
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // 4xx volontaires : on relaie la réponse d'origine (messages sûrs).
    if (exception instanceof HttpException && status < 500) {
      res.status(status).json(exception.getResponse());
      return;
    }

    // 5xx (ou exception non-HTTP) : on masque. Log complet côté serveur,
    // réponse minimale côté client.
    const publicCode =
      (exception as any)?.publicCode ??
      (status === HttpStatus.BAD_GATEWAY || status === HttpStatus.SERVICE_UNAVAILABLE
        ? 'provider_unavailable'
        : 'internal_error');

    this.logger.error({
      error_id: requestId,
      method: req.method,
      path: req.url,
      status,
      message: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    res.status(status).json({ error: { code: publicCode, request_id: requestId } });
  }
}
