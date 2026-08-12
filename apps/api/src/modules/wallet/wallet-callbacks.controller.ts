import { Body, Controller, Headers, Logger, Param, Post, RawBodyRequest, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { WalletService } from './wallet.service';

type OperatorStatus = 'SUCCESSFUL' | 'FAILED' | 'REJECTED';

function toOperatorStatus(raw: string): OperatorStatus {
  if (raw === 'SUCCESSFUL') return 'SUCCESSFUL';
  if (raw === 'REJECTED') return 'REJECTED';
  return 'FAILED';
}

@Controller('v1/wallet/callbacks')
export class WalletCallbacksController {
  private readonly logger = new Logger(WalletCallbacksController.name);

  constructor(
    private readonly wallet: WalletService,
    private readonly config: ConfigService,
  ) {}

  @Post('mtn/:type')
  async mtnCallback(
    @Param('type') type: string,
    @Body() body: Record<string, unknown>,
    @Headers('x-callback-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.#verifyMtnSignature(req.rawBody, signature);

    const referenceId = String(body['financialTransactionId'] ?? body['referenceId'] ?? '');
    const status = toOperatorStatus(String(body['status'] ?? 'FAILED'));

    this.logger.log(`MTN callback type=${type} ref=${referenceId} status=${status}`);

    if (type === 'cash-in') return this.wallet.confirmCashIn(referenceId, status);
    if (type === 'cash-out') return this.wallet.confirmCashOut(referenceId, status);

    return { ok: true, ignored: true };
  }

  @Post('airtel/:type')
  async airtelCallback(
    @Param('type') type: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authHeader: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ) {
    this.#verifyAirtelSignature(req.rawBody, authHeader);

    const tx = (body['transaction'] ?? {}) as Record<string, unknown>;
    const referenceId = String(tx['id'] ?? body['transactionId'] ?? '');
    const statusCode = String(tx['status_code'] ?? body['status'] ?? '');

    let status: OperatorStatus = 'FAILED';
    if (statusCode === 'TS' || statusCode === 'SUCCESSFUL') status = 'SUCCESSFUL';
    else if (statusCode === 'TR' || statusCode === 'REJECTED') status = 'REJECTED';

    this.logger.log(`Airtel callback type=${type} ref=${referenceId} status=${status}`);

    if (type === 'cash-in') return this.wallet.confirmCashIn(referenceId, status);
    if (type === 'cash-out') return this.wallet.confirmCashOut(referenceId, status);

    return { ok: true, ignored: true };
  }

  #allowUnsignedCallbacks(): boolean {
    return (
      this.config.get<string>('NODE_ENV') !== 'production' &&
      this.config.get<string>('ALLOW_UNSIGNED_OPERATOR_CALLBACKS') === 'true'
    );
  }

  #verifyMtnSignature(rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = this.config.get<string>('MTN_WEBHOOK_SECRET');
    if (!secret) {
      if (this.#allowUnsignedCallbacks()) {
        this.logger.warn('MTN unsigned callback accepted explicitly in sandbox/dev');
        return;
      }
      this.logger.error('MTN_WEBHOOK_SECRET is not configured; callback rejected');
      throw new UnauthorizedException();
    }

    if (!signature || !rawBody) {
      throw new UnauthorizedException('Signature MTN manquante');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature.replace(/^sha256=/, ''), 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Signature MTN invalide');
    }
  }

  #verifyAirtelSignature(rawBody: Buffer | undefined, authHeader: string | undefined) {
    const secret = this.config.get<string>('AIRTEL_WEBHOOK_SECRET');
    if (!secret) {
      if (this.#allowUnsignedCallbacks()) {
        this.logger.warn('Airtel unsigned callback accepted explicitly in sandbox/dev');
        return;
      }
      this.logger.error('AIRTEL_WEBHOOK_SECRET is not configured; callback rejected');
      throw new UnauthorizedException();
    }

    if (!authHeader || !rawBody) {
      throw new UnauthorizedException('Signature Airtel manquante');
    }

    const token = authHeader.replace(/^Bearer\s+/i, '');
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const tokBuf = Buffer.from(token, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (tokBuf.length !== expBuf.length || !timingSafeEqual(tokBuf, expBuf)) {
      throw new UnauthorizedException('Signature Airtel invalide');
    }
  }
}
