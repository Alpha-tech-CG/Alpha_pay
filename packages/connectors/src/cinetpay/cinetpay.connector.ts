/**
 * Connecteur CinetPay — paiement par carte Visa/Mastercard (ALP-149).
 *
 * Architecture : hosted checkout + tokenisation côté CinetPay.
 * On ne manipule JAMAIS un PAN, CVV ou donnée de carte brute.
 * 3-D Secure 2.x activé par défaut sur le checkout CinetPay.
 *
 * Docs : https://docs.cinetpay.com/api/cinetpay
 */
import crypto from 'crypto';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { withRetry } from '../retry';
import type { InitiatePaymentDto, PaymentResult, TransactionStatus } from '@paybrain/shared';

interface CinetPayConfig {
  apiKey: string;
  siteId: string;
  baseUrl: string;
  notifyUrl: string;
  returnUrl: string;
}

interface CheckoutSession {
  payment_url: string;
  payment_token: string;
}

export class CinetPayConnector {
  constructor(private readonly config: CinetPayConfig) {}

  /**
   * Crée une session de paiement hébergée et retourne l'URL de redirection.
   * Le marchand redirige le client (web) ou ouvre une WebView (mobile).
   */
  async initiateCheckout(dto: InitiatePaymentDto): Promise<PaymentResult & { checkoutUrl: string }> {
    const transactionId = dto.externalId || uuidv4();

    const response = await withRetry(() =>
      axios.post<{ code: string; data: CheckoutSession }>(
        `${this.config.baseUrl}/payment`,
        {
          apikey: this.config.apiKey,
          site_id: this.config.siteId,
          transaction_id: transactionId,
          amount: dto.amount,
          currency: dto.currency ?? 'XAF',
          description: dto.description ?? 'Paiement PayBrain',
          notify_url: this.config.notifyUrl,
          return_url: this.config.returnUrl,
          channels: 'ALL',   // carte + mobile money
          lang: 'fr',
          // Métadonnées pour rapprochement
          metadata: JSON.stringify({ externalId: dto.externalId }),
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const data = response.data;
    if (data.code !== '201') {
      throw new Error(`CinetPay checkout error: code ${data.code}`);
    }

    return {
      referenceId: data.data.payment_token,
      status: 'PENDING',
      operator: 'CINETPAY',
      checkoutUrl: data.data.payment_url,
    };
  }

  /** Interroge le statut d'une transaction par son payment_token. */
  async getStatus(paymentToken: string): Promise<TransactionStatus> {
    const response = await withRetry(() =>
      axios.post<{ code: string; data: { status: string } }>(
        `${this.config.baseUrl}/check`,
        {
          apikey: this.config.apiKey,
          site_id: this.config.siteId,
          transaction_id: paymentToken,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const status = response.data.data?.status;
    if (status === 'ACCEPTED') return 'SUCCESSFUL';
    if (status === 'REFUSED' || status === 'CANCELLED') return 'FAILED';
    return 'PENDING';
  }

  /**
   * Vérifie la signature HMAC du webhook CinetPay entrant.
   * CinetPay signe avec SHA-256(apiKey + cpm_trans_id + cpm_site_id).
   */
  static verifyWebhookSignature(params: Record<string, string>, apiKey: string): boolean {
    const { cpm_trans_id, cpm_site_id, signature } = params;
    if (!cpm_trans_id || !cpm_site_id || !signature) return false;

    const expected = crypto
      .createHash('sha256')
      .update(`${apiKey}${cpm_trans_id}${cpm_site_id}`)
      .digest('hex');

    // timingSafeEqual lance ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH si les buffers
    // ont des longueurs différentes (signature malformée) — vérifier avant.
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }
}

export function createCinetPayConnector(): CinetPayConnector {
  return new CinetPayConnector({
    apiKey: process.env.CINETPAY_API_KEY!,
    siteId: process.env.CINETPAY_SITE_ID!,
    baseUrl: process.env.CINETPAY_BASE_URL ?? 'https://api-checkout.cinetpay.com/v2',
    notifyUrl: process.env.CINETPAY_NOTIFY_URL ?? `${process.env.PAYBRAIN_WEBHOOK_URL}/webhooks/cinetpay`,
    returnUrl: process.env.CINETPAY_RETURN_URL ?? `${process.env.DASHBOARD_URL}/checkout/return`,
  });
}
