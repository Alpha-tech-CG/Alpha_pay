function detectOperator(phoneNumber) {
  const normalized = phoneNumber.replace(/[\s\-\+]/g, '');

  // Numéros sandbox MTN (test uniquement)
  if (['46733123450', '46733123451', '46733123452'].includes(normalized)) {
    return 'MTN';
  }

  if (!normalized.startsWith('242')) {
    throw new Error(`Numéro invalide : doit commencer par 242. Reçu : ${phoneNumber}`);
  }

  const prefix = normalized.substring(3, 6);

  const MTN_PREFIXES = ['066', '067', '068'];
  const AIRTEL_PREFIXES = ['055', '056', '057', '058', '074', '075', '076', '077'];

  if (MTN_PREFIXES.includes(prefix)) return 'MTN';
  if (AIRTEL_PREFIXES.includes(prefix)) return 'AIRTEL';

  throw new Error(`Opérateur non reconnu pour le préfixe ${prefix}`);
}

function normalizePhone(phoneNumber) {
  let normalized = phoneNumber.replace(/[\s\-\+]/g, '');
  // Format local congolais : 0XXXXXXXX (9 chiffres) → 242XXXXXXXX
  if (normalized.startsWith('0') && normalized.length === 9) {
    normalized = '242' + normalized;
  }
  return normalized;
}

module.exports = { detectOperator, normalizePhone };
