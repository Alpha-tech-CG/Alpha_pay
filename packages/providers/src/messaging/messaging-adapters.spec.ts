import type { HttpClient, HttpRequest } from '../core/http';
import { hmacSha256Hex } from '../core/validation';
import { describeEmailContract, describeSmsContract, describeWhatsAppContract } from '../testing/other.contracts';
import { InfobipSmsProvider } from './infobip.adapter';
import { MetaWhatsAppProvider } from './meta-whatsapp.adapter';
import { SmtpEmailProvider } from './smtp.adapter';

const noSleep = async () => {};

/** Faux client HTTP : enregistre les appels et renvoie la réponse programmée. */
function fakeHttp(respond: (req: HttpRequest) => { status: number; data: any }) {
  const calls: HttpRequest[] = [];
  const http: HttpClient = {
    async request(req) {
      calls.push(req);
      return { ...respond(req), headers: {} };
    },
  };
  return { http, calls };
}

const infobipOk = () => ({ status: 200, data: { messages: [{ messageId: 'ib-1', status: { groupName: 'PENDING' } }] } });
const metaOk = () => ({ status: 200, data: { messages: [{ id: 'wamid.1' }] } });

describeSmsContract('Infobip (faux serveur)', () => ({
  provider: new InfobipSmsProvider(
    { baseUrl: 'https://x.api.infobip.com', apiKey: 'k', senderId: 'AlphaPay' },
    { http: fakeHttp(infobipOk).http, sleep: noSleep },
  ),
  validTo: '+242060000001',
}));

describeWhatsAppContract('Meta WhatsApp Cloud (faux serveur)', () => ({
  provider: new MetaWhatsAppProvider(
    { phoneNumberId: '123', accessToken: 't', appSecret: 's' },
    { http: fakeHttp(metaOk).http, sleep: noSleep },
  ),
  validTo: '+242060000001',
}));

describeEmailContract('SMTP (faux transport)', () => ({
  provider: new SmtpEmailProvider({ sendMail: async () => ({ messageId: '<m1@alphapay>' }) }, 'AlphaPay <no-reply@alphapay.cg>'),
}));

describe('Infobip', () => {
  it('envoie au format attendu (MSISDN sans +, expéditeur, URL d’accusé)', async () => {
    const { http, calls } = fakeHttp(infobipOk);
    const p = new InfobipSmsProvider(
      { baseUrl: 'https://x.api.infobip.com/', apiKey: 'secret', senderId: 'AlphaPay', notifyUrl: 'https://api.alphapay.cg/webhooks/messages/infobip' },
      { http, sleep: noSleep },
    );
    expect(await p.send({ to: '+242061234567', text: 'Bonjour' })).toEqual({ providerMessageId: 'ib-1' });
    expect(calls[0].url).toBe('https://x.api.infobip.com/sms/2/text/advanced');
    expect(calls[0].headers!.Authorization).toBe('App secret');
    expect((calls[0].body as any).messages[0]).toEqual(
      expect.objectContaining({ destinations: [{ to: '242061234567' }], from: 'AlphaPay', text: 'Bonjour', notifyUrl: expect.any(String) }),
    );
  });

  it('un refus Infobip est définitif (pas de nouvelle tentative)', async () => {
    const { http } = fakeHttp(() => ({ status: 200, data: { messages: [{ messageId: 'x', status: { groupName: 'REJECTED', name: 'REJECTED_DESTINATION' } }] } }));
    const p = new InfobipSmsProvider({ baseUrl: 'https://x', apiKey: 'k', senderId: 'A' }, { http, sleep: noSleep });
    await expect(p.send({ to: '+242061234567', text: 't' })).rejects.toMatchObject({ code: 'rejected', retryable: false });
  });

  it('réessaie sur 429 puis abandonne en erreur réessayable', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 429, data: {} }));
    const p = new InfobipSmsProvider({ baseUrl: 'https://x', apiKey: 'k', senderId: 'A' }, { http, sleep: noSleep });
    await expect(p.send({ to: '+242061234567', text: 't' })).rejects.toMatchObject({ code: 'rate_limited', retryable: true });
    expect(calls).toHaveLength(3);
  });

  it('lit les accusés de livraison (statut, motif, coût) et les messages entrants', () => {
    const p = new InfobipSmsProvider({ baseUrl: 'https://x', apiKey: 'k', senderId: 'A' });
    const events = p.parseDeliveryReport({
      headers: {},
      body: {
        results: [
          { messageId: 'a', status: { groupName: 'DELIVERED' }, price: { pricePerMessage: 25, currency: 'XAF' } },
          { messageId: 'b', status: { groupName: 'UNDELIVERABLE', name: 'UNDELIVERABLE_NOT_DELIVERED' }, error: { name: 'EC_ABSENT_SUBSCRIBER' } },
        ],
      },
    });
    expect(events).toEqual([
      { providerMessageId: 'a', status: 'delivered', cost: { amount: 25, currency: 'XAF' } },
      { providerMessageId: 'b', status: 'failed', failureReason: 'EC_ABSENT_SUBSCRIBER' },
    ]);
    expect(p.parseInbound({ headers: {}, body: { results: [{ from: '242061234567', text: 'STOP', cleanText: 'STOP' }] } })).toEqual([
      { from: '+242061234567', text: 'STOP' },
    ]);
  });
});

describe('Meta WhatsApp Cloud', () => {
  const config = { phoneNumberId: '123', accessToken: 'tok', appSecret: 'app-secret' };

  it('envoie un modèle d’authentification avec le bouton « copier le code »', async () => {
    const { http, calls } = fakeHttp(metaOk);
    const p = new MetaWhatsAppProvider(config, { http, sleep: noSleep });
    await p.sendTemplate({ to: '+242061234567', template: 'otp_connexion', language: 'fr', variables: ['482913'], authenticationCode: '482913' });
    expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/123/messages');
    expect(calls[0].headers!.Authorization).toBe('Bearer tok');
    expect(calls[0].body).toEqual({
      messaging_product: 'whatsapp',
      to: '242061234567',
      type: 'template',
      template: {
        name: 'otp_connexion',
        language: { code: 'fr' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '482913' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '482913' }] },
        ],
      },
    });
  });

  it('une erreur destinataire (131026) est définitive : la bascule peut se faire tout de suite', async () => {
    const { http, calls } = fakeHttp(() => ({ status: 400, data: { error: { code: 131026 } } }));
    const p = new MetaWhatsAppProvider(config, { http, sleep: noSleep });
    await expect(p.sendTemplate({ to: '+242061234567', template: 't', language: 'fr', variables: [] })).rejects.toMatchObject({
      code: 'rejected',
      retryable: false,
    });
    expect(calls).toHaveLength(1);
  });

  it('vérifie la signature du webhook et lit statuts et messages entrants', () => {
    const p = new MetaWhatsAppProvider(config);
    const rawBody = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { id: 'wamid.1', status: 'read' },
                  { id: 'wamid.2', status: 'failed', errors: [{ code: 131047 }] },
                ],
                messages: [{ from: '242061234567', text: { body: 'STOP' } }],
              },
            },
          ],
        },
      ],
    });
    const req = { headers: { 'X-Hub-Signature-256': `sha256=${hmacSha256Hex('app-secret', rawBody)}` }, body: JSON.parse(rawBody), rawBody };
    expect(p.parseStatusWebhook(req)).toEqual([
      { providerMessageId: 'wamid.1', status: 'read' },
      { providerMessageId: 'wamid.2', status: 'failed', failureReason: '131047' },
    ]);
    expect(p.parseInbound(req)).toEqual([{ from: '+242061234567', text: 'STOP' }]);
    expect(() => p.parseStatusWebhook({ ...req, rawBody: rawBody.replace('read', 'sent') })).toThrow(
      expect.objectContaining({ code: 'invalid_signature' }),
    );
  });
});

describe('SMTP', () => {
  it('5xx définitif, 4xx et réseau réessayables', async () => {
    const fail = (err: unknown) => new SmtpEmailProvider({ sendMail: async () => Promise.reject(err) }, 'a@b.cg');
    const mail = { to: 'x@y.cg', subject: 's', text: 't' };
    await expect(fail({ responseCode: 550 }).send(mail)).rejects.toMatchObject({ code: 'rejected', retryable: false });
    await expect(fail({ responseCode: 421 }).send(mail)).rejects.toMatchObject({ retryable: true });
    await expect(fail(new Error('ECONNREFUSED')).send(mail)).rejects.toMatchObject({ code: 'network', retryable: true });
  });
});
