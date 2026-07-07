import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CheckoutWalletPayDto } from './dto/wallet.dto';

/**
 * Checkout web « Payer avec PayBrain » (ALP-169).
 *
 * Endpoint public appelé par la page checkout hébergée : le payeur saisit son
 * numéro + PIN, le wallet est débité et le marchand crédité/notifié comme pour
 * un paiement Mobile Money. Rate-limité dans main.ts (/v1/checkout) — le PIN
 * est vérifié en Argon2id anti-timing, jamais de session créée.
 */
@Controller('v1/checkout')
export class WalletCheckoutController {
  constructor(private readonly service: WalletService) {}

  @Post('paylinks/:id/wallet')
  @HttpCode(200)
  payWithWallet(
    @Param('id', ParseUUIDPipe) paylinkId: string,
    @Body() dto: CheckoutWalletPayDto,
  ) {
    return this.service.payPaylink(paylinkId, dto);
  }
}
