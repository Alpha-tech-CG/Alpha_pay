import { FxService } from './fx.service';

describe('FxService', () => {
  const makeRedis = (cached: string | null = null) => ({
    get: jest.fn().mockResolvedValue(cached),
    set: jest.fn().mockResolvedValue('OK'),
  });
  const fxConnector = { getRate: jest.fn().mockResolvedValue({ from: 'XAF', to: 'USDC', rate: 0.00162 }) };
  const config = { get: jest.fn().mockReturnValue(300) };

  it('returns a cached rate without hitting the connector', async () => {
    const redis = makeRedis('0.00162');
    const svc = new FxService(redis as never, fxConnector as never, config as never);
    expect(await svc.getRate('XAF', 'USDC')).toBe(0.00162);
    expect(fxConnector.getRate).not.toHaveBeenCalled();
  });

  it('fetches + caches on a miss', async () => {
    const redis = makeRedis(null);
    const svc = new FxService(redis as never, fxConnector as never, config as never);
    const rate = await svc.getRate('XAF', 'USDC');
    expect(rate).toBe(0.00162);
    expect(redis.set).toHaveBeenCalledWith('fx:XAF:USDC', '0.00162', 'EX', 300);
  });

  it('computes a quote with a 0.8% fee', async () => {
    const svc = new FxService(makeRedis('0.00162') as never, fxConnector as never, config as never);
    const q = await svc.getQuote(50000, 'XAF', 'USDC');
    expect(q.convertedAmount).toBeCloseTo(81, 5); // 50000 * 0.00162
    expect(q.fee).toBeCloseTo(400, 5); // 0.8%
    expect(q.totalCost).toBeCloseTo(50400, 5);
  });
});
