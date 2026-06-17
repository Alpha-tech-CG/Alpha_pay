import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

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

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('X-Request-Id', requestId);

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
