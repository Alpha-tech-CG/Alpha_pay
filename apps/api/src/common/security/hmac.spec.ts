import { randomBytes } from 'crypto';
import { safeEqual, signWebhookPayload, verifyWebhookHmac } from './hmac';

const SECRET = 'whsec_test_secret_partage_operateur';
const NOW = 1_700_000_000;
const now = () => NOW;

function validInput(body: object, ts = NOW) {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  return {
    secret: SECRET,
    signatureHeader: signWebhookPayload(SECRET, ts, raw),
    timestampHeader: String(ts),
    rawBody: raw,
    nowSec: now,
  };
}

describe('verifyWebhookHmac', () => {
  it('accepte une signature valide dans la fenêtre temporelle', () => {
    const res = verifyWebhookHmac(validInput({ status: 'SUCCESSFUL' }));
    expect(res).toEqual({ ok: true, timestamp: NOW });
  });

  it('rejette une signature manquante', () => {
    const input = validInput({ status: 'SUCCESSFUL' });
    const res = verifyWebhookHmac({ ...input, signatureHeader: undefined });
    expect(res).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('rejette un timestamp manquant', () => {
    const input = validInput({ status: 'SUCCESSFUL' });
    const res = verifyWebhookHmac({ ...input, timestampHeader: undefined });
    expect(res).toEqual({ ok: false, reason: 'missing_headers' });
  });

  it('rejette un timestamp hors fenêtre (> ±5 min)', () => {
    const input = validInput({ status: 'SUCCESSFUL' }, NOW - 301);
    const res = verifyWebhookHmac(input);
    expect(res).toEqual({ ok: false, reason: 'skew_exceeded' });
  });

  it('accepte un timestamp en limite de fenêtre (300s)', () => {
    const input = validInput({ status: 'SUCCESSFUL' }, NOW - 300);
    expect(verifyWebhookHmac(input).ok).toBe(true);
  });

  it('rejette un timestamp non numérique', () => {
    const input = validInput({ status: 'SUCCESSFUL' });
    const res = verifyWebhookHmac({ ...input, timestampHeader: 'pas-un-nombre' });
    expect(res).toEqual({ ok: false, reason: 'bad_timestamp' });
  });

  it('rejette une signature au mauvais format hex', () => {
    const input = validInput({ status: 'SUCCESSFUL' });
    const res = verifyWebhookHmac({ ...input, signatureHeader: 'sha256=ZZZZ' });
    expect(res).toEqual({ ok: false, reason: 'bad_signature_format' });
  });

  it('rejette une signature valide en hex mais incorrecte', () => {
    const input = validInput({ status: 'SUCCESSFUL' });
    const wrong = 'sha256=' + 'a'.repeat(64);
    const res = verifyWebhookHmac({ ...input, signatureHeader: wrong });
    expect(res).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('rejette si le body est altéré après signature (intégrité)', () => {
    const input = validInput({ status: 'SUCCESSFUL', amount: '100' });
    const tampered = { ...input, rawBody: Buffer.from(JSON.stringify({ status: 'SUCCESSFUL', amount: '999999' })) };
    expect(verifyWebhookHmac(tampered).ok).toBe(false);
  });

  it('fuzzing : 5000 signatures aléatoires → 100% rejet', () => {
    const input = validInput({ status: 'SUCCESSFUL' });
    for (let i = 0; i < 5000; i++) {
      const fuzz = 'sha256=' + randomBytes(32).toString('hex');
      expect(verifyWebhookHmac({ ...input, signatureHeader: fuzz }).ok).toBe(false);
    }
  });
});

describe('safeEqual', () => {
  it('vrai pour buffers identiques', () => {
    expect(safeEqual(Buffer.from('abc'), Buffer.from('abc'))).toBe(true);
  });
  it('faux pour longueurs différentes sans lever', () => {
    expect(safeEqual(Buffer.from('abc'), Buffer.from('abcd'))).toBe(false);
  });
  it('faux pour même longueur contenu différent', () => {
    expect(safeEqual(Buffer.from('abc'), Buffer.from('abd'))).toBe(false);
  });
});
