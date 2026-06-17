import { BadRequestException, CallHandler, ConflictException, ExecutionContext, UnprocessableEntityException } from '@nestjs/common';
import { of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';

const VALID_KEY = '11111111-1111-4111-8111-111111111111';

/** Fake Prisma : map en mémoire qui simule la contrainte unique composite. */
function createFakePrisma() {
  const rows = new Map<string, any>();
  const keyOf = (w: any) =>
    `${w.merchantId}|${w.idempotencyKey}|${w.endpoint}`;

  return {
    rows,
    idempotencyRecord: {
      create: jest.fn(async ({ data }: any) => {
        const k = `${data.merchantId}|${data.idempotencyKey}|${data.endpoint}`;
        if (rows.has(k)) {
          const err: any = new Error('unique');
          err.code = 'P2002';
          throw err;
        }
        const row = { ...data, requestHash: Buffer.from(data.requestHash) };
        rows.set(k, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const row = rows.get(keyOf(where.merchantId_idempotencyKey_endpoint));
        return row ?? null;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const k = keyOf(where.merchantId_idempotencyKey_endpoint);
        const row = rows.get(k);
        Object.assign(row, data);
        return row;
      }),
    },
  };
}

function makeContext(headers: Record<string, any>, body: any, merchantId = 'm1') {
  const res = {
    statusCode: 201,
    _headers: {} as Record<string, string>,
    setHeader(n: string, v: string) {
      this._headers[n] = v;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
  };
  const req = { headers, body, merchant: { id: merchantId }, method: 'POST', path: '/payments', route: { path: '/payments' } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { ctx, res, req };
}

const handlerReturning = (value: unknown): CallHandler => ({ handle: () => of(value) });

async function run(interceptor: IdempotencyInterceptor, ctx: ExecutionContext, handler: CallHandler) {
  const obs = await interceptor.intercept(ctx, handler);
  return new Promise<unknown>((resolve, reject) => {
    obs.subscribe({ next: resolve, error: reject });
  });
}

describe('IdempotencyInterceptor', () => {
  let prisma: ReturnType<typeof createFakePrisma>;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    prisma = createFakePrisma();
    interceptor = new IdempotencyInterceptor(prisma as any);
  });

  it('rejette une requête sans Idempotency-Key (400)', async () => {
    const { ctx } = makeContext({}, { amount: 100 });
    await expect(run(interceptor, ctx, handlerReturning({ ok: true }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejette une clé non-UUID (400)', async () => {
    const { ctx } = makeContext({ 'idempotency-key': 'pas-un-uuid' }, { amount: 100 });
    await expect(run(interceptor, ctx, handlerReturning({ ok: true }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('exécute le handler à la première requête et mémorise la réponse', async () => {
    const { ctx } = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    const result = await run(interceptor, ctx, handlerReturning({ referenceId: 'ref-1' }));
    expect(result).toEqual({ referenceId: 'ref-1' });
    await new Promise(setImmediate); // laisse le tap persister
    const row = [...prisma.rows.values()][0];
    expect(row.responseBody).toEqual({ referenceId: 'ref-1' });
    expect(row.lockedUntil).toBeNull();
  });

  it('rejoue la réponse mémorisée pour même clé + même body (1 seul appel handler)', async () => {
    const handler = handlerReturning({ referenceId: 'ref-unique' });
    const handleSpy = jest.spyOn(handler, 'handle');

    const first = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    await run(interceptor, first.ctx, handler);
    await new Promise(setImmediate);

    const second = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    const replayed = await run(interceptor, second.ctx, handler);

    expect(replayed).toEqual({ referenceId: 'ref-unique' });
    expect(second.res._headers['Idempotency-Replayed']).toBe('true');
    expect(handleSpy).toHaveBeenCalledTimes(1); // le handler n'est PAS rappelé
  });

  it('renvoie 422 pour même clé + body différent', async () => {
    const first = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    await run(interceptor, first.ctx, handlerReturning({ referenceId: 'ref-1' }));
    await new Promise(setImmediate);

    const second = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 999 });
    await expect(run(interceptor, second.ctx, handlerReturning({ referenceId: 'ref-2' }))).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('renvoie 409 si une requête concurrente est encore verrouillée', async () => {
    // Première requête : on NE flush PAS le tap → la réponse n'est pas encore stockée,
    // le verrou est toujours actif. Une 2e requête simultanée doit tomber en 409.
    const first = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    await run(interceptor, first.ctx, handlerReturning({ referenceId: 'ref-1' }));
    // Simule l'état "en cours" : réponse pas encore persistée, verrou actif.
    const row = [...prisma.rows.values()][0];
    row.responseStatus = null;
    row.lockedUntil = new Date(Date.now() + 30_000);

    const second = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    await expect(run(interceptor, second.ctx, handlerReturning({ referenceId: 'ref-1' }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('reprend la main si le verrou a expiré sans réponse (crash applicatif)', async () => {
    const first = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    await run(interceptor, first.ctx, handlerReturning({ referenceId: 'ref-1' }));
    const row = [...prisma.rows.values()][0];
    row.responseStatus = null;
    row.lockedUntil = new Date(Date.now() - 1_000); // verrou expiré

    const second = makeContext({ 'idempotency-key': VALID_KEY }, { amount: 100 });
    const result = await run(interceptor, second.ctx, handlerReturning({ referenceId: 'ref-reprise' }));
    expect(result).toEqual({ referenceId: 'ref-reprise' });
  });
});
