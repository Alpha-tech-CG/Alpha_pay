import { InvoicesService } from './invoices.service';

// computeAmounts uses snake_case DTO fields
const line = (description: string, quantity: number, unit_price: number, tax_rate = 0) =>
  ({ description, quantity, unit_price, tax_rate });

describe('InvoicesService.computeAmounts', () => {
  let svc: InvoicesService;

  beforeAll(() => {
    svc = new InvoicesService({} as any);
  });

  it('calcule sous-total, taxe et total sans taxe', () => {
    const r = (svc as any).computeAmounts([line('A', 2, 5000)]);
    expect(r.subtotal).toBe(10000n);
    expect(r.taxAmount).toBe(0n);
    expect(r.total).toBe(10000n);
  });

  it('calcule avec une taxe de 18 %', () => {
    const r = (svc as any).computeAmounts([line('B', 1, 10000, 18)]);
    expect(r.subtotal).toBe(10000n);
    expect(r.taxAmount).toBe(1800n);
    expect(r.total).toBe(11800n);
  });

  it('arrondit correctement', () => {
    const r = (svc as any).computeAmounts([line('C', 3, 1000, 10)]);
    expect(r.subtotal).toBe(3000n);
    expect(r.taxAmount).toBe(300n);
    expect(r.total).toBe(3300n);
  });

  it('somme correctement plusieurs lignes', () => {
    const r = (svc as any).computeAmounts([
      line('D', 1, 5000),
      line('E', 2, 2500, 18),
    ]);
    expect(r.subtotal).toBe(10000n);
    // 18 % de 5000 (ligne E) = 900
    expect(r.taxAmount).toBe(900n);
    expect(r.total).toBe(10900n);
  });
});
