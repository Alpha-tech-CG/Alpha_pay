import { ProviderError } from '../core/errors';
import { PAYMENT_STATUSES } from '../mobile-money/types';
import type { IncomingRequest, MobileMoneyProvider } from '../mobile-money/types';

export interface MobileMoneyHarness {
  provider: MobileMoneyProvider;
  currency: string;
  phones: { success: string; failure: string };
  /** Amène le fournisseur au statut final (avance du temps, règlement du faux serveur…). */
  settle(): void | Promise<void>;
  /** Nombre d'appels HTTP émis jusqu'ici (0 pour un mock sans réseau). */
  httpCalls(): number;
  /** Callback tel que l'opérateur l'enverrait, si l'adaptateur en reçoit. */
  callbackFor?(input: { reference: string; providerRef: string; status: 'succeeded' | 'failed' }): IncomingRequest;
}

let seq = 0;
const ref = () => `ap_contract_${Date.now()}_${seq++}`;

/**
 * Suite de contrat commune à tous les adaptateurs `MobileMoneyProvider`
 * (§9 Tests de contrat). Tout nouvel opérateur doit la passer.
 */
export function describeMobileMoneyContract(name: string, makeHarness: () => MobileMoneyHarness): void {
  describe(`Contrat MobileMoneyProvider — ${name}`, () => {
    let h: MobileMoneyHarness;
    beforeEach(() => {
      h = makeHarness();
    });

    it('expose un identifiant d’opérateur', () => {
      expect(typeof h.provider.operator).toBe('string');
      expect(h.provider.operator.length).toBeGreaterThan(0);
    });

    it('requestPayment renvoie une référence fournisseur et le statut pending', async () => {
      const res = await h.provider.requestPayment({ amount: 1500, currency: h.currency, payerPhone: h.phones.success, reference: ref() });
      expect(res.providerRef).toEqual(expect.any(String));
      expect(res.providerRef.length).toBeGreaterThan(0);
      expect(res.status).toBe('pending');
    });

    it('rejouer la même référence ne crée pas de doublon (même providerRef, pas d’erreur)', async () => {
      const reference = ref();
      const input = { amount: 1500, currency: h.currency, payerPhone: h.phones.success, reference };
      const a = await h.provider.requestPayment(input);
      const b = await h.provider.requestPayment(input);
      expect(b.providerRef).toBe(a.providerRef);
    });

    it('un paiement accepté par le payeur aboutit à succeeded', async () => {
      const { providerRef } = await h.provider.requestPayment({ amount: 1500, currency: h.currency, payerPhone: h.phones.success, reference: ref() });
      await h.settle();
      expect((await h.provider.getPaymentStatus(providerRef)).status).toBe('succeeded');
    });

    it('un paiement refusé aboutit à failed avec un motif', async () => {
      const { providerRef } = await h.provider.requestPayment({ amount: 1500, currency: h.currency, payerPhone: h.phones.failure, reference: ref() });
      await h.settle();
      const res = await h.provider.getPaymentStatus(providerRef);
      expect(res.status).toBe('failed');
      expect(res.failureReason).toEqual(expect.any(String));
    });

    it('ne renvoie que des statuts unifiés', async () => {
      const { providerRef } = await h.provider.requestPayment({ amount: 1500, currency: h.currency, payerPhone: h.phones.success, reference: ref() });
      expect(PAYMENT_STATUSES).toContain((await h.provider.getPaymentStatus(providerRef)).status);
    });

    it.each([
      ['montant décimal', { amount: 10.5 }],
      ['montant nul', { amount: 0 }],
      ['numéro non E.164', { payerPhone: '061234567' }],
      ['devise inconnue', { currency: 'ZZZ' }],
    ])('refuse une entrée invalide (%s) sans appeler l’opérateur', async (_label, override) => {
      const before = h.httpCalls();
      await expect(
        h.provider.requestPayment({ amount: 1500, currency: h.currency, payerPhone: h.phones.success, reference: ref(), ...override }),
      ).rejects.toMatchObject({ code: 'invalid_request' });
      expect(h.httpCalls()).toBe(before);
    });

    it('une référence inconnue lève une ProviderError not_found', async () => {
      await expect(h.provider.getPaymentStatus('inconnue-0000')).rejects.toBeInstanceOf(ProviderError);
      await expect(h.provider.getPaymentStatus('inconnue-0000')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('parseCallback (si supporté) retrouve la référence fournisseur et le statut', async () => {
      if (!h.provider.parseCallback || !h.callbackFor) return;
      const reference = ref();
      const { providerRef } = await h.provider.requestPayment({ amount: 1500, currency: h.currency, payerPhone: h.phones.success, reference });
      const parsed = h.provider.parseCallback(h.callbackFor({ reference, providerRef, status: 'succeeded' }));
      expect(parsed).toEqual(expect.objectContaining({ providerRef, status: 'succeeded' }));
      expect(h.provider.parseCallback({ headers: {}, body: { inattendu: true } })).toBeNull();
    });

    it('verifyAccountHolder (si supporté) renvoie un booléen active', async () => {
      if (!h.provider.verifyAccountHolder) return;
      const res = await h.provider.verifyAccountHolder(h.phones.success);
      expect(typeof res.active).toBe('boolean');
    });
  });
}
