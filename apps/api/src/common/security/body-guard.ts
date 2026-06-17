import type { NextFunction, Request, Response } from 'express';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export interface BodyGuardOptions {
  /** Taille maximale du corps en octets (défaut 8 KiB). */
  maxBytes?: number;
}

/**
 * Durcissement HTTP des requêtes mutantes (ALP-153) :
 *   - Content-Type ≠ application/json → 415 unsupported_media_type
 *   - Content-Length > maxBytes → 413 payload_too_large (rejet AVANT parsing)
 *
 * Le rejet sur Content-Length évite de bufferiser un payload de 1 Mo juste pour
 * le refuser ensuite. La limite du body-parser JSON (8kb) reste la deuxième
 * barrière pour les requêtes sans Content-Length honnête (chunked).
 */
export function bodyGuard(options: BodyGuardOptions = {}) {
  const maxBytes = options.maxBytes ?? 8 * 1024;

  return function bodyGuardMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!MUTATING_METHODS.has(req.method)) {
      return next();
    }

    const contentType = String(req.headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType !== 'application/json') {
      return res.status(415).json({ code: 'unsupported_media_type', message: 'Content-Type application/json requis.' });
    }

    const len = Number.parseInt(String(req.headers['content-length'] ?? '0'), 10);
    if (Number.isFinite(len) && len > maxBytes) {
      return res.status(413).json({ code: 'payload_too_large', message: `Corps limité à ${maxBytes} octets.` });
    }

    next();
  };
}
