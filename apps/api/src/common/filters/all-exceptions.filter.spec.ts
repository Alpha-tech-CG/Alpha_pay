import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { IsInt, Min } from 'class-validator';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiError, validationExceptionFactory } from '../errors/api-error';
import { logger } from '../logging/logger';
import { requestContext } from '../logging/request-context';

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

describe('AllExceptionsFilter (ALP-154, §7)', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('masque une erreur non-HTTP (fuite de message interdite)', () => {
    const { host, res } = makeHost();
    requestContext.run({ requestId: 'req-12345678' }, () => filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), host));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: { code: 'erreur_interne', message: expect.any(String), request_id: 'req-12345678' } });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(res.headers['X-Request-Id']).toBe('req-12345678');
  });

  it('masque une InternalServerErrorException avec son message brut', () => {
    const { host, res } = makeHost();
    filter.catch(new InternalServerErrorException('SQL: relation "x" does not exist'), host);

    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SQL');
    expect(res.body).toMatchObject({ error: { code: 'erreur_interne' } });
  });

  it('journalise le détail côté serveur', () => {
    const { host } = makeHost();
    filter.catch(new Error('secret interne'), host);
    const logged = (logger.error as unknown as jest.Mock).mock.calls[0][0];
    expect(logged.err.message).toBe('secret interne');
  });

  it('relaie un 4xx métier au format unique, code et message préservés', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException({ code: 'idempotency_key_required', message: 'requis' }), host);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: { code: 'idempotency_key_required', message: 'requis', request_id: expect.any(String) } });
  });

  it('ApiError porte code, message et champ', () => {
    const { host, res } = makeHost();
    filter.catch(new ApiError(402, 'credits_insuffisants', 'Solde de crédits insuffisant', 'channel'), host);
    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({
      error: { code: 'credits_insuffisants', message: 'Solde de crédits insuffisant', param: 'channel', request_id: expect.any(String) },
    });
  });

  it.each([
    [new NotFoundException('Lien introuvable'), 404, 'introuvable', 'Lien introuvable'],
    [new ForbiddenException(), 403, 'acces_refuse', 'Forbidden'],
    [new HttpException('Trop', 429), 429, 'trop_de_requetes', 'Trop'],
  ])('donne un code par défaut selon le statut (%#)', (exception, status, code, message) => {
    const { host, res } = makeHost();
    filter.catch(exception, host);
    expect(res.statusCode).toBe(status);
    expect(res.body).toMatchObject({ error: { code, message } });
  });

  it('erreur de validation : code validation_echouee et champ en cause', async () => {
    class Dto {
      @IsInt()
      @Min(1)
      amount!: number;
    }
    const pipe = new ValidationPipe({ exceptionFactory: validationExceptionFactory });
    const err = await pipe.transform({ amount: 0 }, { type: 'body', metatype: Dto }).catch((e) => e);
    const { host, res } = makeHost();
    filter.catch(err, host);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'validation_echouee', param: 'amount', message: expect.stringContaining('amount') } });
  });

  it('mappe 503 vers fournisseur_indisponible', () => {
    const { host, res } = makeHost();
    filter.catch(new HttpException('upstream down', HttpStatus.SERVICE_UNAVAILABLE), host);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ error: { code: 'fournisseur_indisponible' } });
  });

  it("respecte un publicCode porté par l'exception", () => {
    const { host, res } = makeHost();
    const err: any = new Error('détail interne');
    err.publicCode = 'reconciliation_failed';
    filter.catch(err, host);

    expect(res.body).toMatchObject({ error: { code: 'reconciliation_failed' } });
  });

  it('mappe un JSON malformé (entity.parse.failed) vers un 400 générique sans fuite', () => {
    const { host, res } = makeHost();
    const err: any = new Error("Expected property name or '}' in JSON at position 2");
    err.type = 'entity.parse.failed';
    filter.catch(err, host);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'json_invalide' } });
    expect(JSON.stringify(res.body)).not.toContain('position');
  });

  it('mappe un parse JSON enveloppé en BadRequestException vers json_invalide', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException("Expected property name or '}' in JSON at position 2"), host);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'json_invalide' } });
  });

  it('ne réécrit pas une réponse déjà émise (headersSent)', () => {
    const { host, res } = makeHost();
    (res as any).headersSent = true;
    filter.catch(new Error('boom'), host);
    expect(res.statusCode).toBe(0); // status() jamais appelé
  });
});
