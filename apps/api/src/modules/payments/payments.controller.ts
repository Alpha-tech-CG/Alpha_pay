import { Body, Controller, Get, Param, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  initiate(@Body() dto: CreatePaymentDto, @Req() req: any) {
    return this.paymentsService.initiatePayment(dto, req.merchant.id);
  }

  @Get(':referenceId')
  getStatus(@Param('referenceId') referenceId: string, @Req() req: any) {
    return this.paymentsService.getStatus(referenceId, req.merchant.id);
  }
}
