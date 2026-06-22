import { Body, Controller, Get, Param, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { IdempotencyInterceptor } from '../../common/idempotency/idempotency.interceptor';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@ApiTags('Paiements')
@ApiSecurity('ApiKey')
@Controller('payments')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @RequiredScopes('payments:write')
  @UseInterceptors(IdempotencyInterceptor)
  initiate(@Body() dto: CreatePaymentDto, @Req() req: any) {
    return this.paymentsService.initiatePayment(dto, req.merchant.id);
  }

  @Get(':referenceId')
  @RequiredScopes('payments:read')
  getStatus(@Param('referenceId') referenceId: string, @Req() req: any) {
    return this.paymentsService.getStatus(referenceId, req.merchant.id);
  }
}
