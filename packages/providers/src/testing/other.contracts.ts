import { ProviderError } from '../core/errors';
import type { CardAcquirer } from '../card/types';
import type { KycProvider, KycWebhookEvent } from '../kyc/types';
import type { EmailProvider, SmsProvider, WhatsAppProvider } from '../messaging/types';
import type { IncomingRequest } from '../mobile-money/types';

/** Contrat commun des adaptateurs KYC (Sumsub, mock). */
export function describeKycContract(
  name: string,
  make: () => {
    provider: KycProvider;
    /** Fait aboutir la vérification du demandeur et renvoie le webhook signé correspondant. */
    complete(applicantId: string): IncomingRequest | Promise<IncomingRequest>;
  },
): void {
  describe(`Contrat KycProvider — ${name}`, () => {
    it('crée un demandeur, fournit un lien de vérification à durée limitée', async () => {
      const { provider } = make();
      const { applicantId } = await provider.createApplicant({ externalId: 'kyb_1', lastName: 'Mabiala' });
      const link = await provider.createVerificationLink(applicantId, { ttlSeconds: 600 });
      expect(link.url).toMatch(/^https?:\/\//);
      expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect((await provider.getResult(applicantId)).decision).toBe('pending');
    });

    it('le webhook signé porte le résultat et la référence AlphaPay', async () => {
      const h = make();
      const { applicantId } = await h.provider.createApplicant({ externalId: 'kyb_2', lastName: 'Mabiala' });
      const event = h.provider.parseWebhook(await h.complete(applicantId)) as KycWebhookEvent;
      expect(event).toEqual(expect.objectContaining({ applicantId, externalId: 'kyb_2' }));
      expect(['approved', 'rejected', 'retry']).toContain(event.decision);
    });

    it('rejette un webhook dont la signature est altérée', async () => {
      const h = make();
      const { applicantId } = await h.provider.createApplicant({ externalId: 'kyb_3' });
      const req = await h.complete(applicantId);
      const tampered = { ...req, rawBody: req.rawBody!.replace('kyb_3', 'kyb_X') };
      expect(() => h.provider.parseWebhook(tampered)).toThrow(expect.objectContaining({ code: 'invalid_signature' }));
    });
  });
}

/** Contrat commun des fournisseurs de messages. `undeliverable` est une destination qui échoue. */
export function describeSmsContract(name: string, make: () => { provider: SmsProvider; validTo: string }): void {
  describe(`Contrat SmsProvider — ${name}`, () => {
    it('envoie et renvoie un identifiant fournisseur', async () => {
      const { provider, validTo } = make();
      const res = await provider.send({ to: validTo, text: 'Paiement reçu : 15 000 XAF' });
      expect(res.providerMessageId).toEqual(expect.any(String));
    });
    it('refuse un numéro non E.164', async () => {
      const { provider } = make();
      await expect(provider.send({ to: '061234567', text: 'x' })).rejects.toMatchObject({ code: 'invalid_request' });
    });
  });
}

export function describeWhatsAppContract(name: string, make: () => { provider: WhatsAppProvider; validTo: string }): void {
  describe(`Contrat WhatsAppProvider — ${name}`, () => {
    it('envoie un modèle avec ses variables', async () => {
      const { provider, validTo } = make();
      const res = await provider.sendTemplate({ to: validTo, template: 'otp_connexion', language: 'fr', variables: ['123456'] });
      expect(res.providerMessageId).toEqual(expect.any(String));
    });
    it('refuse un numéro non E.164', async () => {
      const { provider } = make();
      await expect(provider.sendTemplate({ to: 'abc', template: 't', language: 'fr', variables: [] })).rejects.toBeInstanceOf(ProviderError);
    });
  });
}

export function describeEmailContract(name: string, make: () => { provider: EmailProvider }): void {
  describe(`Contrat EmailProvider — ${name}`, () => {
    it('envoie un email texte', async () => {
      const { provider } = make();
      const res = await provider.send({ to: 'gerant@example.cg', subject: 'Reçu', text: 'Merci' });
      expect(res.providerMessageId).toEqual(expect.any(String));
    });
    it('refuse une adresse invalide', async () => {
      const { provider } = make();
      await expect(provider.send({ to: 'pas-un-email', subject: 's', text: 't' })).rejects.toMatchObject({ code: 'invalid_request' });
    });
  });
}

/** Contrat commun des acquéreurs carte (page hébergée partenaire). */
export function describeCardContract(
  name: string,
  make: () => { acquirer: CardAcquirer; complete(sessionId: string, outcome: 'succeeded' | 'failed' | 'canceled'): Promise<IncomingRequest> },
): void {
  describe(`Contrat CardAcquirer — ${name}`, () => {
    const input = { amount: 25_000, currency: 'XAF', reference: 'ap_card_1', returnUrl: 'https://ex.cg/ok', cancelUrl: 'https://ex.cg/ko' };

    it('crée une session hébergée sans aucune donnée de carte', async () => {
      const { acquirer } = make();
      const s = await acquirer.createSession(input);
      expect(s.redirectUrl).toMatch(/^https?:\/\//);
      expect(JSON.stringify(s)).not.toMatch(/pan|cvv|card_?number/i);
      expect((await acquirer.getSessionStatus(s.sessionId)).status).toBe('pending');
    });

    it.each(['succeeded', 'failed', 'canceled'] as const)('le retour %s est lu par webhook signé et par statut', async (outcome) => {
      const h = make();
      const s = await h.acquirer.createSession(input);
      const parsed = h.acquirer.parseWebhook(await h.complete(s.sessionId, outcome));
      expect(parsed).toEqual({ type: 'payment', payment: expect.objectContaining({ providerRef: s.sessionId, status: outcome }) });
      expect((await h.acquirer.getSessionStatus(s.sessionId)).status).toBe(outcome);
    });

    it('rejette un webhook altéré', async () => {
      const h = make();
      const s = await h.acquirer.createSession(input);
      const req = await h.complete(s.sessionId, 'failed');
      expect(() => h.acquirer.parseWebhook({ ...req, rawBody: req.rawBody!.replace('failed', 'succeeded') })).toThrow(
        expect.objectContaining({ code: 'invalid_signature' }),
      );
    });

    it('rembourse au plus le montant payé, sans doublon sur une même référence', async () => {
      const h = make();
      const s = await h.acquirer.createSession(input);
      await h.complete(s.sessionId, 'succeeded');
      const first = await h.acquirer.refund({ sessionId: s.sessionId, amount: 10_000, currency: 'XAF', reference: 'rf_1' });
      expect(first.status).toBe('succeeded');
      expect(await h.acquirer.refund({ sessionId: s.sessionId, amount: 10_000, currency: 'XAF', reference: 'rf_1' })).toEqual(first);
      expect((await h.acquirer.refund({ sessionId: s.sessionId, amount: 20_000, currency: 'XAF', reference: 'rf_2' })).status).toBe('failed');
    });
  });
}
