import defaultConfig from '../config/operators.cg.json';
import { MobileMoneyOperator } from '../types/payment';

/**
 * Numéros de téléphone (§4.2) : stockés en E.164. Un numéro local du Congo
 * (06xxxxxxx, 05xxxxxxx, 04xxxxxxx) devient +242 suivi des 9 chiffres, en
 * conservant le 0. Les plages de préfixes opérateurs viennent de la
 * configuration (`config/operators.cg.json`, surchargeable par la variable
 * d'environnement PHONE_OPERATOR_PREFIXES), jamais du code.
 */
export interface OperatorConfig {
  countryCode: string;
  nationalNumberLength: number;
  prefixes: Partial<Record<MobileMoneyOperator, string[]>>;
  sandboxNumbers?: Partial<Record<MobileMoneyOperator, string[]>>;
}

export class InvalidPhoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPhoneError';
  }
}

/** Configuration effective : fichier par défaut, préfixes éventuellement surchargés par l'environnement. */
export function operatorConfig(): OperatorConfig {
  const override = process.env.PHONE_OPERATOR_PREFIXES;
  if (!override) return defaultConfig as OperatorConfig;
  try {
    return { ...(defaultConfig as OperatorConfig), prefixes: JSON.parse(override) };
  } catch {
    throw new Error('PHONE_OPERATOR_PREFIXES doit être un JSON, ex. {"MTN":["06"],"AIRTEL":["05","04"]}');
  }
}

/** Normalise une saisie libre en E.164. Lève InvalidPhoneError si le numéro est inexploitable. */
export function toE164(input: string, config: OperatorConfig = operatorConfig()): string {
  if (typeof input !== 'string') throw new InvalidPhoneError('Numéro manquant');
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/[\s.\-()]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) throw new InvalidPhoneError('Le numéro ne doit contenir que des chiffres');

  if (!hasPlus) {
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length === config.nationalNumberLength) {
      // Numéro local : on préfixe l'indicatif en conservant le 0 (+242 06…).
      digits = config.countryCode + digits;
    } else if (!digits.startsWith(config.countryCode) && digits.length < 10) {
      // Trop court pour un numéro international sans « + » : saisie locale incomplète.
      throw new InvalidPhoneError('Numéro local attendu au format 0XXXXXXXX');
    }
  }

  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
    throw new InvalidPhoneError('Numéro de téléphone invalide');
  }
  if (digits.startsWith(config.countryCode) && digits.length !== config.countryCode.length + config.nationalNumberLength) {
    throw new InvalidPhoneError(`Un numéro +${config.countryCode} compte ${config.nationalNumberLength} chiffres après l'indicatif`);
  }
  return `+${digits}`;
}

/**
 * Opérateur déduit du préfixe (le plus long qui correspond). L'appelant peut
 * toujours le remplacer par un choix explicite de l'utilisateur.
 */
export function detectOperator(phone: string, config: OperatorConfig = operatorConfig()): MobileMoneyOperator {
  const e164 = toE164(phone, config);
  for (const [operator, numbers] of Object.entries(config.sandboxNumbers ?? {})) {
    if (numbers?.includes(e164)) return operator as MobileMoneyOperator;
  }
  const cc = `+${config.countryCode}`;
  if (!e164.startsWith(cc)) throw new InvalidPhoneError(`Opérateur non détectable hors ${cc} : précisez-le`);
  const national = e164.slice(cc.length);

  let best: { operator: MobileMoneyOperator; length: number } | null = null;
  for (const [operator, prefixes] of Object.entries(config.prefixes)) {
    for (const prefix of prefixes ?? []) {
      if (national.startsWith(prefix) && (!best || prefix.length > best.length)) {
        best = { operator: operator as MobileMoneyOperator, length: prefix.length };
      }
    }
  }
  if (!best) throw new InvalidPhoneError(`Opérateur non reconnu pour le préfixe ${national.slice(0, 2)} : précisez-le`);
  return best.operator;
}
