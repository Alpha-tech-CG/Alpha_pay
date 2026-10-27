import pino from 'pino';
import { Writable } from 'stream';
import { maskPii, REDACTED_PATHS } from './mask';
import { requestContext } from './request-context';

describe('maskPii', () => {
  it.each([
    ['Paiement de +242061234567 accepté', 'Paiement de ***4567 accepté'],
    ['MSISDN 242061234567', 'MSISDN ***4567'],
    ['Contact jean.mabiala@example.cg', 'Contact je***@example.cg'],
    ['Pièce 1234567890123', 'Pièce ***0123'],
  ])('%s', (input, expected) => {
    expect(maskPii(input)).toBe(expected);
  });

  it('laisse intacts les petits nombres (montants, codes HTTP)', () => {
    expect(maskPii('15000 XAF, statut 202, 1234')).toBe('15000 XAF, statut 202, 1234');
  });
});

describe('journal JSON', () => {
  it('retire les champs sensibles et ajoute le request_id', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const log = pino(
      {
        messageKey: 'message',
        redact: { paths: REDACTED_PATHS, censor: '[masqué]' },
        mixin: () => (requestContext.getStore() ? { request_id: requestContext.getStore()!.requestId } : {}),
      },
      sink,
    );
    requestContext.run({ requestId: 'req-abcdefgh' }, () =>
      log.info({ password: 'hunter2', otp: '123456', body: { phone: '+242061234567', amount: 1500 } }, 'connexion'),
    );
    const entry = JSON.parse(lines[0]);
    expect(entry.request_id).toBe('req-abcdefgh');
    expect(entry.password).toBe('[masqué]');
    expect(entry.otp).toBe('[masqué]');
    expect(entry.body.phone).toBe('[masqué]');
    expect(entry.body.amount).toBe(1500);
    expect(lines[0]).not.toContain('hunter2');
    expect(lines[0]).not.toContain('123456');
  });
});
