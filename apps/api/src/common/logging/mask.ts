/**
 * Masquage des données personnelles dans les journaux (§8.1) : téléphones,
 * emails et numéros longs (pièces d'identité) dans les chaînes libres.
 * Les champs sensibles nommés (mot de passe, OTP, jeton…) sont, eux, retirés
 * par la configuration `redact` du logger.
 */
const EMAIL = /([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
// Suites de 8 à 15 chiffres, éventuellement précédées de + (E.164, MSISDN, n° de pièce).
const LONG_NUMBER = /\+?\d{4,}(\d{4})(?!\d)/g;

export function maskPii(text: string): string {
  return text
    .replace(EMAIL, (_m, start: string, domain: string) => `${start}***@${domain}`)
    .replace(LONG_NUMBER, (m: string, last4: string) => (m.replace('+', '').length >= 8 ? `***${last4}` : m));
}

/** Champs retirés de tout objet journalisé, à toute profondeur prise en charge par pino. */
export const REDACTED_PATHS = [
  'password',
  'newPassword',
  'otp',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'credentials',
  'pin',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers.cookie',
  '*.password',
  '*.otp',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.credentials',
  '*.pin',
  '*.phone',
  '*.email',
];
