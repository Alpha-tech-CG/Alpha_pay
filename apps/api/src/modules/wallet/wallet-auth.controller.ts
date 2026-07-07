import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { WalletAuthService } from './wallet-auth.service';
import { LoginWalletDto, RegisterWalletDto, ResendOtpDto, VerifyOtpDto } from './dto/wallet.dto';

@Controller('v1/wallet/auth')
export class WalletAuthController {
  constructor(private readonly service: WalletAuthService) {}

  /** Inscription : crée un wallet PENDING_VERIFICATION + envoie l'OTP SMS (ALP-171) */
  @Post('register')
  register(@Body() dto: RegisterWalletDto) {
    return this.service.register(dto);
  }

  /** Vérifie le code SMS, active le compte et retourne un JWT */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.service.verifyOtp(dto);
  }

  /** Renvoie un nouveau code SMS (compte non vérifié uniquement) */
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.service.resendOtp(dto);
  }

  /** Connexion : vérifie PIN (verrouillage progressif ALP-173), retourne JWT */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginWalletDto) {
    return this.service.login(dto);
  }
}
