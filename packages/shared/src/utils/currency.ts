// Registre des devises supportées (ALP-151). Source unique de vérité pour les
// décimales, la validation des montants et le formatage. XAF (Franc CFA) n'a
// PAS de sous-unité (0 décimale) ; EUR/USD en ont 2.

export interface CurrencyInfo {
  code: string;
  /** Nombre de décimales de la sous-unité (ISO 4217). */
  decimals: number;
  name: string;
  symbol: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  XAF: { code: 'XAF', decimals: 0, name: 'Franc CFA (BEAC)', symbol: 'FCFA' },
  EUR: { code: 'EUR', decimals: 2, name: 'Euro', symbol: '€' },
  USD: { code: 'USD', decimals: 2, name: 'Dollar US', symbol: '$' },
};

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCIES);

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

export function currencyDecimals(code: string): number {
  const info = CURRENCIES[code];
  if (!info) throw new Error(`Devise non supportée : ${code}`);
  return info.decimals;
}

/** Facteur de conversion vers la sous-unité (10^décimales). XAF=1, EUR/USD=100. */
export function minorFactor(code: string): number {
  return 10 ** currencyDecimals(code);
}

/**
 * Valide qu'un montant en unité majeure respecte la précision de la devise :
 * entier pour XAF, ≤ 2 décimales pour EUR/USD. Rejette NaN/Infini/négatif.
 */
export function isValidMajorAmount(major: number, code: string): boolean {
  if (!Number.isFinite(major) || major <= 0) return false;
  const factor = minorFactor(code);
  // Le montant ×facteur doit être un entier (pas de fraction de sous-unité).
  return Number.isInteger(Math.round(major * factor)) && Math.abs(major * factor - Math.round(major * factor)) < 1e-9;
}

/** Formate un montant (unité majeure) selon la devise : "2 500 FCFA", "10,50 €". */
export function formatMoney(major: number, code: string, locale = 'fr-FR'): string {
  const info = CURRENCIES[code];
  if (!info) return `${major} ${code}`;
  const num = major.toLocaleString(locale, {
    minimumFractionDigits: info.decimals,
    maximumFractionDigits: info.decimals,
  });
  return `${num} ${info.symbol}`;
}
