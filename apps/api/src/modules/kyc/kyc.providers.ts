import { Logger } from '@nestjs/common';

const logger = new Logger('KycProviders');

export interface SmileResult {
  score: number; // 0-100
  documentVerified: boolean;
  biometricVerified: boolean;
  stubbed?: boolean;
}

/**
 * Document + Biometric Verification via Smile Identity (ALP-142).
 * Gated par SMILE_PARTNER_ID + SMILE_API_KEY. Sans credentials, mode stub :
 * renvoie un score élevé déterministe (le webhook Smile fait foi en prod).
 */
export async function verifyWithSmile(merchantId: string): Promise<SmileResult> {
  const partnerId = process.env.SMILE_PARTNER_ID;
  const apiKey = process.env.SMILE_API_KEY;
  if (!partnerId || !apiKey) {
    logger.debug(`Smile (stub) -> ${merchantId}: score 95`);
    return { score: 95, documentVerified: true, biometricVerified: true, stubbed: true };
  }
  // TODO : appel réel Smile Identity (Document + Biometric KYC) + traitement du
  // webhook de retour (POST /webhooks/smile). Stub conservé tant que pas de compte.
  return { score: 95, documentVerified: true, biometricVerified: true, stubbed: true };
}

export interface ScreeningResult {
  hit: boolean;
  lists: string[];
}

// Liste de démonstration. En prod : flux OFAC SDN, UE, ONU (mis à jour quotidiennement).
const DEMO_SANCTIONS = ['osama bin laden', 'viktor bout', 'test sanctioned person'];

/** Screening sanctions/PEP (OFAC, UE, ONU) — stub liste locale (ALP-142). */
export function screenSanctions(fullName: string): ScreeningResult {
  const norm = fullName.trim().toLowerCase();
  const hit = DEMO_SANCTIONS.includes(norm);
  return { hit, lists: hit ? ['DEMO_OFAC'] : [] };
}
