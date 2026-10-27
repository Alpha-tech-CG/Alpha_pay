import { ANY_MODE, assertLivemodeScoped, LivemodeScopeError } from '@paybrain/database';

describe('garde livemode (§4.6)', () => {
  it('refuse une liste de transactions sans livemode', () => {
    expect(() => assertLivemodeScoped('Transaction', 'findMany', { where: { merchantId: 'm' } })).toThrow(LivemodeScopeError);
    expect(() => assertLivemodeScoped('Transaction', 'groupBy', { where: { merchantId: 'm' }, by: ['status'] })).toThrow(LivemodeScopeError);
    expect(() => assertLivemodeScoped('PaymentLink', 'count', {})).toThrow(LivemodeScopeError);
  });

  it('accepte livemode explicite, ANY_MODE délibéré, ou un id précis', () => {
    expect(() => assertLivemodeScoped('Transaction', 'findMany', { where: { merchantId: 'm', livemode: true } })).not.toThrow();
    expect(() => assertLivemodeScoped('Transaction', 'findFirst', { where: { livemode: ANY_MODE, OR: [] } })).not.toThrow();
    expect(() => assertLivemodeScoped('Transaction', 'updateMany', { where: { id: 'tx-1', version: 2 } })).not.toThrow();
    expect(() => assertLivemodeScoped('WebhookEndpoint', 'findMany', { where: { AND: [{ merchantId: 'm' }, { livemode: false }] } })).not.toThrow();
  });

  it('exige livemode à la création', () => {
    expect(() => assertLivemodeScoped('PaymentLink', 'create', { data: { merchantId: 'm' } })).toThrow(LivemodeScopeError);
    expect(() => assertLivemodeScoped('PaymentLink', 'create', { data: { merchantId: 'm', livemode: false } })).not.toThrow();
    expect(() => assertLivemodeScoped('Transaction', 'createMany', { data: [{ livemode: true }, {}] })).toThrow(LivemodeScopeError);
  });

  it('ignore les modèles sans mode et les lectures par clé unique', () => {
    expect(() => assertLivemodeScoped('Merchant', 'findMany', {})).not.toThrow();
    expect(() => assertLivemodeScoped('PaymentLink', 'findUnique', { where: { id: 'l' } })).not.toThrow();
  });
});
