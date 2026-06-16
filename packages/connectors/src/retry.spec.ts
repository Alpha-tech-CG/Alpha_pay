import { withRetry, isTransientError } from './retry';

describe('isTransientError', () => {
  it('treats network errors (no response) as transient', () => {
    expect(isTransientError({})).toBe(true);
  });

  it('treats 5xx and 429 as transient', () => {
    expect(isTransientError({ response: { status: 500 } })).toBe(true);
    expect(isTransientError({ response: { status: 503 } })).toBe(true);
    expect(isTransientError({ response: { status: 429 } })).toBe(true);
  });

  it('treats 4xx (other than 429) as definitive, not transient', () => {
    expect(isTransientError({ response: { status: 400 } })).toBe(false);
    expect(isTransientError({ response: { status: 401 } })).toBe(false);
    expect(isTransientError({ response: { status: 404 } })).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on a transient error and eventually succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately on a non-transient error without retrying', async () => {
    const fn = jest.fn().mockRejectedValue({ response: { status: 400 } });
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toEqual({ response: { status: 400 } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue({ response: { status: 500 } });
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toEqual({
      response: { status: 500 },
    });
    expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });
});
