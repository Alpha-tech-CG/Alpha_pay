import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { InternalGuard } from '../../common/guards/internal.guard';
import { CurrencyService } from './currency.service';
import { ConvertDto, QuoteDto, SetRateDto } from './dto/currency.dto';

@ApiTags('Devises')
@ApiSecurity('ApiKey')
@Controller('v1')
@UseGuards(ApiKeyGuard)
export class CurrencyController {
  constructor(private readonly currency: CurrencyService) {}

  @Get('currencies')
  list() {
    return this.currency.listCurrencies();
  }

  @Get('fx/rates')
  rates() {
    return this.currency.listRates();
  }

  @Get('fx/quote')
  quote(@Query() dto: QuoteDto) {
    return this.currency.convert(dto.amount, dto.from, dto.to);
  }
}

// Gestion des taux : réservée aux opérations internes.
@Controller('internal/fx')
@UseGuards(InternalGuard)
export class CurrencyAdminController {
  constructor(private readonly currency: CurrencyService) {}

  @Post('rates')
  setRate(@Body() dto: SetRateDto) {
    return this.currency.upsertRate(dto.base, dto.quote, dto.rate);
  }

  // Convertit le solde d'un marchand d'une devise à l'autre et l'écrit au ledger.
  @Post('convert')
  convert(@Body() dto: ConvertDto) {
    return this.currency.convertAndRecord(dto.merchantId, dto.amount, dto.from, dto.to);
  }
}
