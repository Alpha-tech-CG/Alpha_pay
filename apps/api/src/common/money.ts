import { minorFactor, currencyDecimals } from '@paybrain/shared';

// Montants (§4.1, D-007) : stockés en BIGINT, en unités mineures selon
// l'exposant ISO 4217 de la devise. XAF (exposant 0) → francs entiers, sans
// centimes ; EUR du sandbox MTN (exposant 2) → centimes. Jamais de flottant
// en base. L'API publique reçoit et renvoie des unités majeures.

/** Unités majeures (API) → unités mineures (stockage). */
export function toMinor(major: number, currency: string): bigint {
  return BigInt(Math.round(major * minorFactor(currency)));
}

/** Unités mineures (stockage) → unités majeures (API). */
export function toMajorAmount(minor: bigint | number, currency: string): number {
  return Number(minor) / minorFactor(currency);
}

const NBSP = ' ';

/**
 * Affichage avec séparateur de milliers : « 15 000 XAF », « 1 250,50 EUR ».
 * Espaces insécables : le montant ne se coupe jamais en fin de ligne.
 */
export function formatAmount(minor: bigint | number, currency: string): string {
  const decimals = currencyDecimals(currency);
  const value = BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const factor = 10n ** BigInt(decimals);
  const units = (abs / factor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const fraction = decimals > 0 ? `,${(abs % factor).toString().padStart(decimals, '0')}` : '';
  return `${negative ? '-' : ''}${units}${fraction}${NBSP}${currency}`;
}
