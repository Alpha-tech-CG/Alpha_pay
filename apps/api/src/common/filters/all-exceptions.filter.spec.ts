import { BadRequestException, HttpException, HttpStatus, InternalServerErrorException, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function makeHost(method = 'POST', url = '/payments') {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(n: string, v: string) {
      this.headers[n] = v;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
  };
  const req = { method, url, headers: {} as Record<string, string> };
  const host: any = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  };
  return { host, res, req };
}

describe('AllExceptionsFilter (ALP-154)', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('masque une erreur non-HTTP (fuite de message interdite)', () => {
    const { host, res } = makeHost();
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal_error', request_id: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(res.headers['X-Request-Id']).toBeDefined();
  });

  it('masque une InternalServerErrorException avec son message brut', () => {
    const { host, res } = makeHost();
    filter.catch(new InternalServerErrorException('SQL: relation "x" does not exist'), host);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SQL');
    expect(res.body).toMatchObject({ error: { code: 'internal_error' } });
  });

  it('logue la trace complète côté serveur (corrélée au request_id)', () => {
    const spy = jest.spyOn(Logger.prototype, 'error');
    const { host, res } = makeHost();
    filter.catch(new Error('secret interne'), host);

    const logged = spy.mock.calls[0][0] as any;
    expect(logged.message).toBe('secret interne');
    expect(logged.error_id).toBe(res.headers['X-Request-Id']);
  });

  it('relaie un 4xx volontaire sans le masquer (message utile préservé)', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException({ code: 'idempotency_key_required', message: 'requis' }), host);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'idempotency_key_required' });
  });

  it('mappe 503 vers provider_unavailable', () => {
    const { host, res } = makeHost();
    filter.catch(new HttpException('upstream down', HttpStatus.SERVICE_UNAVAILABLE), host);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'provider_unavailable' } });
  });

  it('respecte un publicCode porté par l\'exception', () => {
    const { host, res } = makeHost();
    const err: any = new Error('détail interne');
    err.publicCode = 'reconciliation_failed';
    filter.catch(err, host);

    expect(res.body).toMatchObject({ error: { code: 'reconciliation_failed' } });
  });

  it('mappe un JSON malformé (entity.parse.failed) vers un 400 générique sans fuite', () => {
    const { host, res } = makeHost();
    const err: any = new Error('Expected property name or \'}\' in JSON at position 2');
    err.type = 'entity.parse.failed';
    filter.catch(err, host);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: 'invalid_json', request_id: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toContain('position');
  });

  it('mappe un parse JSON enveloppé en BadRequestException vers invalid_json', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException("Expected property name or '}' in JSON at position 2"), host);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: 'invalid_json', request_id: expect.any(String) } });
  });

  it('ne confond pas un 400 métier légitime avec un parse error', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException({ code: 'idempotency_key_required', message: 'requis' }), host);

    expect(res.body).toMatchObject({ code: 'idempotency_key_required' });
  });

  it('ne réécrit pas une réponse déjà émise (headersSent)', () => {
    const { host, res } = makeHost();
    (res as any).headersSent = true;
    filter.catch(new Error('boom'), host);
    expect(res.statusCode).toBe(0); // status() jamais appelé
  });
});
