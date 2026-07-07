import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { WalletAuthService } from './wallet-auth.service';
import { LoginWalletDto, RegisterWalletDto } from './dto/wallet.dto';

@Controller('v1/wallet/auth')
export class WalletAuthController {
  constructor(private readonly service: WalletAuthService) {}

  /** Inscription : crée un wallet (phone + PIN) */
  @Post('register')
  register(@Body() dto: RegisterWalletDto) {
    return this.service.register(dto);
  }

  /** Connexion : vérifie PIN, retourne JWT */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginWalletDto) {
    return this.service.login(dto);
  }
}
