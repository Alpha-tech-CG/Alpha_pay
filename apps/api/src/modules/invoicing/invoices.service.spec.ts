import { computeAmounts, planInstallments, reachableChannels } from './invoices.service';
import { formatDocumentNumber } from './document-numbers';
import { inWindow, localDate, nextInWindow, reminderTime } from './recovery-time';
import { safeCell } from '../exports/exports.service';

const line = (description: string, quantity: number, unit_price: number, tax_rate = 0) => ({ description, quantity, unit_price, tax_rate });
const W = { fromHour: 8, untilHour: 19 };

describe('computeAmounts (§M7, montants entiers en XAF)', () => {
  it('sous-total, taxe et total', () => {
    const r = computeAmounts([line('A', 2, 5000), line('B', 1, 10000, 18)], 'XAF');
    expect(r.subtotal).toBe(20000n);
    expect(r.taxAmount).toBe(1800n);
    expect(r.total).toBe(21800n);
    expect(r.lines.map((l) => l.amount)).toEqual([10000n, 10000n]);
  });

  it('quantité décimale arrondie à l’unité mineure, jamais de flottant stocké', () => {
    const r = computeAmounts([line('Ciment (kg)', 2.5, 333)], 'XAF');
    expect(r.total).toBe(833n);
    expect(typeof r.total).toBe('bigint');
  });

  it('EUR (sandbox MTN) : prix en centimes', () => {
    const r = computeAmounts([line('Test', 1, 12.5)], 'EUR');
    expect(r.lines[0].unitPrice).toBe(1250n);
    expect(r.total).toBe(1250n);
  });
});

describe('planInstallments (échéanciers)', () => {
  it('trie par date et numérote les versements', () => {
    const plan = planInstallments([{ due_date: '2027-01-15', amount: 30000 }, { due_date: '2026-11-15', amount: 20000 }], 50000n, 'XAF');
    expect(plan.map((p) => p.position)).toEqual([1, 2]);
    expect(plan[0].dueDate.toISOString().slice(0, 10)).toBe('2026-11-15');
  });

  it('refuse une somme différente du total', () => {
    expect(() => planInstallments([{ due_date: '2026-11-15', amount: 20000 }, { due_date: '2026-12-15', amount: 20000 }], 50000n, 'XAF')).toThrow(/doit égaler le total/);
  });
});

describe('reachableChannels', () => {
  it('garde l’ordre des préférences et écarte les canaux sans contact', () => {
    expect(reachableChannels({ preferredChannels: ['WHATSAPP', 'EMAIL', 'SMS'], phone: '+242061234567', email: null })).toEqual(['WHATSAPP', 'SMS']);
    expect(reachableChannels({ preferredChannels: ['SMS'], phone: null, email: 'a@b.cg' })).toEqual([]);
  });
});

describe('Numérotation des documents', () => {
  it('séries distinctes test/live, sans ambiguïté sur un document imprimé', () => {
    expect(formatDocumentNumber('receipt', true, 42)).toBe('REC-000042');
    expect(formatDocumentNumber('receipt', false, 42)).toBe('REC-T-000042');
    expect(formatDocumentNumber('invoice', true, 1)).toBe('FAC-000001');
  });
});

describe('Heure de Brazzaville (UTC+1) et plage d’envoi 8 h-19 h', () => {
  it('jour local et plage', () => {
    expect(localDate(new Date('2026-11-14T23:30:00Z'))).toBe('2026-11-15'); // 00 h 30 à Brazzaville
    expect(inWindow(new Date('2026-11-15T07:00:00Z'), W)).toBe(true); // 8 h locale
    expect(inWindow(new Date('2026-11-15T06:59:00Z'), W)).toBe(false);
    expect(inWindow(new Date('2026-11-15T18:00:00Z'), W)).toBe(false); // 19 h locale : exclue
  });

  it('hors plage : reporté au prochain créneau', () => {
    expect(nextInWindow(new Date('2026-11-15T04:00:00Z'), W).toISOString()).toBe('2026-11-15T07:00:00.000Z');
    expect(nextInWindow(new Date('2026-11-15T20:00:00Z'), W).toISOString()).toBe('2026-11-16T07:00:00.000Z');
  });

  it('relance J-3 à 8 h locale ; jour passé ignoré ; jour entamé envoyé tout de suite', () => {
    const due = new Date('2026-12-10T00:00:00Z');
    const now = new Date('2026-12-01T10:00:00Z');
    expect(reminderTime(due, -3, W, now)!.toISOString()).toBe('2026-12-07T07:00:00.000Z');
    expect(reminderTime(due, -10, W, now)).toBeNull();
    const today = new Date('2026-12-10T09:00:00Z');
    expect(reminderTime(due, 0, W, today)!.toISOString()).toBe(today.toISOString());
    expect(reminderTime(due, 0, W, new Date('2026-12-10T19:00:00Z'))).toBeNull(); // 20 h : trop tard
  });
});

describe('Exports : injection de formules', () => {
  it('neutralise = + - @ en début de cellule', () => {
    expect(safeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeCell('-1+2')).toBe(`'-1+2`);
    expect(safeCell(15000)).toBe(15000);
    expect(safeCell('Boutique')).toBe('Boutique');
  });
});
