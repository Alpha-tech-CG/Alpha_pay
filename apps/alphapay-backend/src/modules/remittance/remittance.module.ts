import { Body, Controller, Injectable, Module, Post, UseGuards } from '@nestjs/common';
import { IsNumber, IsPositive, IsString } from 'class-validator';
import { FxService } from '../fx/fx.service';
import { FxModule } from '../fx/fx.module';
import { PaymentsService } from '../payments/payments.service';
import { PaymentsModule } from '../payments/payments.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class QuoteDto {
  @IsNumber() @IsPositive() amount: number;
  @IsString() from: string;
  @IsString() to: string;
}
class SendDto {
  @IsNumber() @IsPositive() amount: number;
  @IsString() sourceCurrency: string;
  @IsString() targetCurrency: string;
  @IsString() recipientPhone: string;
  @IsString() corridor: string;
}

@Injectable()
class RemittanceService {
  constructor(private readonly fx: FxService, private readonly payments: PaymentsService) {}
  quote(dto: QuoteDto) {
    return this.fx.getQuote(dto.amount, dto.from, dto.to);
  }
  send(userId: string, dto: SendDto) {
    return this.payments.initiateInternationalPayment(userId, dto);
  }
}

@Controller('remittance')
@UseGuards(JwtAuthGuard)
class RemittanceController {
  constructor(private readonly svc: RemittanceService) {}
  @Post('quote') quote(@Body() dto: QuoteDto) { return this.svc.quote(dto); }
  @Post('send') send(@CurrentUser('sub') u: string, @Body() dto: SendDto) { return this.svc.send(u, dto); }
}

@Module({
  imports: [FxModule, PaymentsModule],
  providers: [RemittanceService],
  controllers: [RemittanceController],
})
export class RemittanceModule {}
