import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QrSigningService } from './qr-signing.service';

function makeService(env: Record<string, string> = { QR_SIGNING_SECRET: 'test-secret' }) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new QrSigningService(config);
}

describe('QrSigningService (ALP-172)', () => {
  it('signe puis vérifie un payload (roundtrip)', () => {
    const svc = makeService();
    const { qrPayload } = svc.sign({ merchantId: 'm1', amountCents: 5000, description: 'Achat tissu' });

    const verified = svc.verify(qrPayload);
    expect(verified.merchantId).toBe('m1');
    expect(verified.amountCents).toBe(5000);
    expect(verified.description).toBe('Achat tissu');
    expect(verified.nonce).toHaveLength(36);
  });

  it('rejette un montant falsifié après signature', () => {
    const svc = makeService();
    const { qrPayload } = svc.sign({ merchantId: 'm1', amountCents: 5000 });
    const tampered = JSON.stringify({ ...JSON.parse(qrPayload), amountCents: 1 });

    expect(() => svc.verify(tampered)).toThrow(BadRequestException);
    expect(() => svc.verify(tampered)).toThrow(/signature/i);
  });

  it('rejette un merchantId falsifié après signature', () => {
    const svc = makeService();
    const { qrPayload } = svc.sign({ merchantId: 'm1', amountCents: 5000 });
    const tampered = JSON.stringify({ ...JSON.parse(qrPayload), merchantId: 'attacker' });

    expect(() => svc.verify(tampered)).toThrow(/signature/i);
  });

  it('rejette un QR expiré', () => {
    const svc = makeService();
    const { qrPayload } = svc.sign({ merchantId: 'm1', amountCents: 5000 }, -10);

    expect(() => svc.verify(qrPayload)).toThrow(/expiré/i);
  });

  it('rejette un QR non signé (ancien format)', () => {
    const svc = makeService();
    const legacy = JSON.stringify({ merchantId: 'm1', amountCents: 5000 });

    expect(() => svc.verify(legacy)).toThrow(/non signé/i);
  });

  it('rejette un QR signé avec un autre secret', () => {
    const other = makeService({ QR_SIGNING_SECRET: 'autre-secret' });
    const svc = makeService();
    const { qrPayload } = other.sign({ merchantId: 'm1', amountCents: 5000 });

    expect(() => svc.verify(qrPayload)).toThrow(/signature/i);
  });

  it('rejette un JSON malformé et une structure invalide', () => {
    const svc = makeService();
    expect(() => svc.verify('pas-du-json')).toThrow(/malformé/i);
    expect(() => svc.verify('[1,2]')).toThrow(/structure/i);
    expect(() => svc.verify(JSON.stringify({ merchantId: '', amountCents: 5 }))).toThrow(/merchantId/i);
    expect(() => svc.verify(JSON.stringify({ merchantId: 'm1', amountCents: -5 }))).toThrow(/montant/i);
  });

  it('refuse de démarrer en production sans secret', () => {
    const svc = makeService({ NODE_ENV: 'production' });
    expect(() => svc.onModuleInit()).toThrow(/QR_SIGNING_SECRET/);
  });

  it('démarre en dev sans secret (warning)', () => {
    const svc = makeService({});
    expect(() => svc.onModuleInit()).not.toThrow();
  });
});
