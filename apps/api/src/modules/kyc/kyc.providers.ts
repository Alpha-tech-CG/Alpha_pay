import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface SmileJob { jobId: string }
export interface SmileCallbackResult {
  jobId: string;
  score: number;
  documentVerified: boolean;
  biometricVerified: boolean;
}
export interface ScreeningResult { hit: boolean; lists: string[] }

@Injectable()
export class KycProviderService {
  async startSmileVerification(merchantId: string, documentKeys: string[]): Promise<SmileJob> {
    const url = process.env.SMILE_API_URL;
    const partnerId = process.env.SMILE_PARTNER_ID;
    const apiKey = process.env.SMILE_API_KEY;
    const callbackUrl = process.env.SMILE_CALLBACK_URL;
    if (!url || !partnerId || !apiKey || !callbackUrl) {
      throw new ServiceUnavailableException('Smile Identity non configuré');
    }
    const response = await fetch(`${url.replace(/\/$/, '')}/jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ partnerId, merchantId, jobType: 'DOCUMENT_AND_BIOMETRIC', documentKeys, callbackUrl }),
    });
    if (!response.ok) throw new ServiceUnavailableException(`Smile Identity indisponible (${response.status})`);
    const body = await response.json() as { jobId?: string };
    if (!body.jobId) throw new ServiceUnavailableException('Réponse Smile Identity invalide');
    return { jobId: body.jobId };
  }

  /**
   * Récupère le résultat AUTORITATIF d'un job Smile (ALP-VULN).
   *
   * Le webhook entrant ne sert que de déclencheur : on ne fait jamais confiance
   * au score/flags transportés dans son corps. On interroge Smile par jobId pour
   * obtenir la décision réelle (même principe que le webhook opérateur).
   */
  async getJobStatus(jobId: string): Promise<SmileCallbackResult> {
    const url = process.env.SMILE_API_URL;
    const apiKey = process.env.SMILE_API_KEY;
    if (!url || !apiKey) throw new ServiceUnavailableException('Smile Identity non configuré');
    const response = await fetch(`${url.replace(/\/$/, '')}/jobs/${encodeURIComponent(jobId)}`, {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new ServiceUnavailableException(`Smile Identity indisponible (${response.status})`);
    const body = (await response.json()) as Partial<SmileCallbackResult>;
    return {
      jobId,
      score: typeof body.score === 'number' ? body.score : 0,
      documentVerified: body.documentVerified === true,
      biometricVerified: body.biometricVerified === true,
    };
  }

  async screenSanctions(fullName: string): Promise<ScreeningResult> {
    const url = process.env.SANCTIONS_API_URL;
    const token = process.env.SANCTIONS_API_TOKEN;
    if (!url || !token) throw new ServiceUnavailableException('Screening sanctions/PEP non configuré');
    const response = await fetch(`${url.replace(/\/$/, '')}/screenings`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: fullName, sources: ['OFAC', 'EU', 'UN', 'PEP'] }),
    });
    if (!response.ok) throw new ServiceUnavailableException(`Screening sanctions indisponible (${response.status})`);
    const body = await response.json() as { hit?: boolean; lists?: string[] };
    return { hit: body.hit === true, lists: Array.isArray(body.lists) ? body.lists : [] };
  }
}
