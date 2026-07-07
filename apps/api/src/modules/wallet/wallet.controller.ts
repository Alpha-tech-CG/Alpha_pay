import {
  Body, Controller, Get, Post, Query, UseGuards, Request,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletJwtGuard, WalletJwtPayload } from './wallet-jwt.guard';
import { CashInDto, CashOutDto, P2PDto, PayQrDto } from './dto/wallet.dto';

interface AuthRequest {
  wallet: WalletJwtPayload;
}

@Controller('v1/wallet')
@UseGuards(WalletJwtGuard)
export class WalletController {
  constructor(private readonly service: WalletService) {}

  @Get('balance')
  getBalance(@Request() req: AuthRequest) {
    return this.service.getBalance(req.wallet);
  }

  @Get('transactions')
  getHistory(@Request() req: AuthRequest, @Query('limit') limit?: string) {
    return this.service.getHistory(req.wallet, limit ? parseInt(limit, 10) : 30);
  }

  @Post('cash-in')
  cashIn(@Request() req: AuthRequest, @Body() dto: CashInDto) {
    return this.service.cashIn(req.wallet, dto);
  }

  @Post('pay')
  pay(@Request() req: AuthRequest, @Body() dto: PayQrDto) {
    return this.service.payQr(req.wallet, dto);
  }

  @Post('cash-out')
  cashOut(@Request() req: AuthRequest, @Body() dto: CashOutDto) {
    return this.service.cashOut(req.wallet, dto);
  }

  @Post('p2p')
  p2p(@Request() req: AuthRequest, @Body() dto: P2PDto) {
    return this.service.p2p(req.wallet, dto);
  }
}
