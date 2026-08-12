import { Module } from '@nestjs/common';
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { FxService } from './fx.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('fx')
@UseGuards(JwtAuthGuard)
class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rate')
  async rate(@Query('from') from: string, @Query('to') to: string) {
    return { from, to, rate: await this.fx.getRate(from, to) };
  }

  @Post('quote')
  quote(@Body() body: { amount: number; from: string; to: string }) {
    return this.fx.getQuote(body.amount, body.from, body.to);
  }
}

@Module({
  providers: [FxService],
  controllers: [FxController],
  exports: [FxService],
})
export class FxModule {}
