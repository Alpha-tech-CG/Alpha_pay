import { MobileMoneyOperator } from '../types/payment';

const MTN_PREFIXES = ['066', '067', '068'];
const AIRTEL_PREFIXES = ['055', '056', '057', '058', '074', '075', '076', '077'];
const MTN_SANDBOX_NUMBERS = ['46733123450', '46733123451', '46733123452'];

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\+]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 9) {
    return '242' + cleaned;
  }
  return cleaned;
}

export function detectOperator(phone: string): MobileMoneyOperator {
  const normalized = normalizePhone(phone);

  if (MTN_SANDBOX_NUMBERS.includes(normalized)) return 'MTN';

  if (!normalized.startsWith('242')) {
    throw new Error(`Numéro invalide — doit commencer par 242 ou être un numéro sandbox MTN`);
  }

  const prefix = normalized.substring(3, 6);

  if (MTN_PREFIXES.includes(prefix)) return 'MTN';
  if (AIRTEL_PREFIXES.includes(prefix)) return 'AIRTEL';

  throw new Error(`Opérateur non reconnu pour le préfixe ${prefix}`);
}
