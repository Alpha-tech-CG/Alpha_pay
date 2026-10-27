import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { readFileSync } from 'fs';
import { join } from 'path';
import { IsE164Phone } from '../../common/validation/is-e164-phone.validator';
import { CheckoutService } from './checkout.service';

class PayTillDto {
  @ApiProperty({ example: '+242061234567' })
  @IsE164Phone()
  phone!: string;

  @ApiProperty({ example: 2500 })
  @IsInt({ message: 'amount doit être un entier (pas de décimale)' })
  amount!: number;

  @ApiPropertyOptional({ enum: ['mtn', 'airtel'] })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsIn(['MTN', 'AIRTEL'], { message: 'operator : mtn ou airtel' })
  operator?: 'MTN' | 'AIRTEL';
}

/** Fichiers de la page hébergée, lus une fois (copiés dans dist par nest-cli « assets »). */
const PAGE_DIR = join(__dirname, 'public');
let cache: { html: string; js: string } | undefined;
function files() {
  cache ??= { html: readFileSync(join(PAGE_DIR, 'index.html'), 'utf8'), js: readFileSync(join(PAGE_DIR, 'app.js'), 'utf8') };
  return cache;
}

/** API de la page de paiement hébergée (publique, sans compte). */
@ApiTags('Page de paiement (public)')
@Controller('v1/public')
export class CheckoutApiController {
  constructor(private readonly checkout: CheckoutService) {}

  @Get('tills/:code')
  tillView(@Param('code') code: string) {
    return this.checkout.tillView(code);
  }

  @Post('tills/:code/pay')
  @HttpCode(201)
  payTill(@Param('code') code: string, @Body() dto: PayTillDto) {
    return this.checkout.payTill(code, dto);
  }

  @Get('payments/:id')
  @Header('Cache-Control', 'no-store')
  status(@Param('id', ParseUUIDPipe) id: string, @Query('token') token: string) {
    return this.checkout.status(id, token);
  }
}

/**
 * Page hébergée (T-53) : HTML et JavaScript sans framework, quelques Ko, pour
 * fonctionner en 3G. `/l/<code>` = lien de paiement, `/c/<code>` = caisse (QR).
 */
@Controller()
export class CheckoutPageController {
  @Get(['l/:code', 'c/:code'])
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  page(@Res() res: any) {
    res.send(files().html);
  }

  @Get('checkout/app.js')
  @ApiExcludeEndpoint()
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=3600')
  script(@Res() res: any) {
    res.send(files().js);
  }
}
