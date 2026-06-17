// Conversions entre unités majeures (API publique) et centimes (stockage BIGINT).
// Les montants sont des entiers en unités majeures côté API (ALP-152), stockés
// en centimes pour éviter tout arrondi flottant (ALP-168).

export function toCents(major: number): bigint {
  return BigInt(Math.round(major * 100));
}

export function toMajor(cents: bigint | number): number {
  return Number(cents) / 100;
}
