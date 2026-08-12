import { Body, Controller, Get, Injectable, Module, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Injectable()
class QrService {
  constructor(private readonly config: ConfigService) {}

  private sign(payload: object): string {
    const body = JSON.stringify(payload);
    const sig = createHmac('sha256', this.config.get<string>('jwt.accessSecret') ?? 'dev')
      .update(body)
      .digest('hex')
      .slice(0, 32);
    return JSON.stringify({ ...payload, sig });
  }

  static(qrCodeId: string): { payload: string } {
    return { payload: this.sign({ v: 1, type: 'static', qrCodeId }) };
  }

  dynamic(qrCodeId: string, amountCents: number, description?: string): { payload: string; expiresAt: string } {
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    return { payload: this.sign({ v: 1, type: 'dynamic', qrCodeId, amountCents, description, expiresAt }), expiresAt };
  }
}

@Controller('qr')
@UseGuards(JwtAuthGuard)
class QrController {
  constructor(private readonly qr: QrService) {}
  @Get('static') staticQr(@Query('qrCodeId') qrCodeId: string) { return this.qr.static(qrCodeId); }
  @Post('dynamic') dynamicQr(@Body() b: { qrCodeId: string; amountCents: number; description?: string }) {
    return this.qr.dynamic(b.qrCodeId, b.amountCents, b.description);
  }
}

@Module({ providers: [QrService], controllers: [QrController], exports: [QrService] })
export class QrModule {}
