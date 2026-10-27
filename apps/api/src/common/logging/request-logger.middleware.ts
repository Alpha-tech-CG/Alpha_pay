import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { requestContext } from './request-context';

// Un identifiant fourni par l'appelant n'est repris que s'il est court et sûr.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Attribue un `request_id` à chaque requête (repris de X-Request-Id s'il est
 * sûr), le renvoie en en-tête, le propage via AsyncLocalStorage et journalise
 * une ligne d'accès : méthode, route, statut, durée. Ni corps ni query string
 * (données personnelles possibles).
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    (req as any).id = requestId;
    res.setHeader('X-Request-Id', requestId);
    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const route = (req as any).route?.path ? `${req.baseUrl}${(req as any).route.path}` : req.path;
      requestContext.run({ requestId }, () =>
        logger.info(
          {
            method: req.method,
            route,
            status: res.statusCode,
            duration_ms: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
          },
          'requête',
        ),
      );
    });

    requestContext.run({ requestId }, () => next());
  };
}
