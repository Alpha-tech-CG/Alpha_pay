import type { NextFunction, Request, Response } from "express";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH"]);

export interface BodyGuardOptions {
  /** Taille maximale du corps en octets (défaut 8 KiB). */
  maxBytes?: number;
  /** Chemins fournisseur autorisés à envoyer un formulaire URL-encodé. */
  formUrlencodedPaths?: string[];
  /** Chemins autorisés à envoyer un multipart (upload de document). */
  multipartPaths?: string[];
  /** Borne dédiée aux uploads multipart (défaut 6 MiB). */
  multipartMaxBytes?: number;
}

/** Borne et contrôle le type des corps HTTP avant leur traitement métier. */
export function bodyGuard(options: BodyGuardOptions = {}) {
  const maxBytes = options.maxBytes ?? 8 * 1024;
  const formUrlencodedPaths = options.formUrlencodedPaths ?? [];
  const multipartPaths = options.multipartPaths ?? [];
  const multipartMaxBytes = options.multipartMaxBytes ?? 6 * 1024 * 1024;

  return function bodyGuardMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const len = Number.parseInt(
      String(req.headers["content-length"] ?? "0"),
      10,
    );
    const hasBody =
      (Number.isFinite(len) && len > 0) ||
      req.headers["transfer-encoding"] != null;
    if (!hasBody) return next();

    const contentType = String(req.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const formAllowed =
      contentType === "application/x-www-form-urlencoded" &&
      formUrlencodedPaths.some((path) => req.path?.startsWith(path));

    // Uploads multipart : uniquement sur les chemins allowlistés, avec une
    // borne dédiée (les documents dépassent forcément les 8 KiB JSON).
    if (
      contentType === "multipart/form-data" &&
      multipartPaths.some((path) => req.path?.startsWith(path))
    ) {
      if (Number.isFinite(len) && len > multipartMaxBytes) {
        return res.status(413).json({
          code: "payload_too_large",
          message: `Corps limité à ${multipartMaxBytes} octets.`,
        });
      }
      return next();
    }

    if (contentType !== "application/json" && !formAllowed) {
      return res.status(415).json({
        code: "unsupported_media_type",
        message: "Content-Type application/json requis.",
      });
    }
    if (Number.isFinite(len) && len > maxBytes) {
      return res.status(413).json({
        code: "payload_too_large",
        message: `Corps limité à ${maxBytes} octets.`,
      });
    }
    next();
  };
}
