import { Module } from '@nestjs/common';
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto, CreateTransferDto, TransactionFilterDto } from './dto/payments.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersModule } from '../users/users.module';
import { FxModule } from '../fx/fx.module';

@Controller('payments')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } }) // 30 req / min for /payments/*
class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('local')
  local(@CurrentUser('sub') userId: string, @Body() dto: InitiatePaymentDto) {
    return this.payments.initiateLocalPayment(userId, dto);
  }

  @Post('international')
  international(@CurrentUser('sub') userId: string, @Body() dto: CreateTransferDto) {
    return this.payments.initiateInternationalPayment(userId, dto);
  }

  @Get(':id')
  status(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.payments.getTransactionStatus(userId, id);
  }

  @Get()
  list(@CurrentUser('sub') userId: string, @Query() filters: TransactionFilterDto) {
    return this.payments.getUserTransactions(userId, filters);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Transaction]), UsersModule, FxModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
