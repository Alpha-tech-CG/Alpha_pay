import { HttpException, HttpStatus, ValidationError } from '@nestjs/common';

/**
 * Format d'erreur unique de l'API (§7) :
 *   { "error": { "code": "credits_insuffisants", "message": "…", "param": "…" } }
 * Codes en snake_case sans accent (D-017).
 */
export interface ApiErrorBody {
  error: { code: string; message: string; param?: string; request_id?: string };
}

/** Code par défaut d'un statut HTTP, quand l'erreur n'en précise pas. */
export const DEFAULT_ERROR_CODES: Record<number, string> = {
  400: 'requete_invalide',
  401: 'non_authentifie',
  402: 'credits_insuffisants',
  403: 'acces_refuse',
  404: 'introuvable',
  405: 'methode_non_autorisee',
  409: 'conflit',
  413: 'requete_trop_volumineuse',
  415: 'type_de_contenu_non_supporte',
  422: 'regle_metier',
  429: 'trop_de_requetes',
};

export function defaultCodeFor(status: number): string {
  return DEFAULT_ERROR_CODES[status] ?? (status >= 500 ? 'erreur_interne' : 'requete_invalide');
}

/** Erreur métier explicite. `param` désigne le champ fautif, s'il y en a un. */
export class ApiError extends HttpException {
  constructor(status: HttpStatus | number, code: string, message: string, param?: string) {
    super({ code, message, ...(param ? { param } : {}) }, status);
  }
}

export function errorBody(code: string, message: string, param?: string): ApiErrorBody {
  return { error: { code, message, ...(param ? { param } : {}) } };
}

/** Première contrainte non respectée, en profondeur (objets imbriqués). */
function firstViolation(errors: ValidationError[], prefix = ''): { param: string; message: string } | null {
  for (const e of errors) {
    const param = prefix ? `${prefix}.${e.property}` : e.property;
    const messages = Object.values(e.constraints ?? {});
    if (messages.length > 0) return { param, message: messages[0] };
    const nested = firstViolation(e.children ?? [], param);
    if (nested) return nested;
  }
  return null;
}

/** exceptionFactory du ValidationPipe : 400 `validation_echouee` avec le champ en cause. */
export function validationExceptionFactory(errors: ValidationError[]): ApiError {
  const v = firstViolation(errors);
  return new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', v?.message ?? 'Requête invalide', v?.param);
}
