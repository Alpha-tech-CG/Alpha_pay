import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WalletAuthController } from './wallet-auth.controller';
import { WalletAuthService } from './wallet-auth.service';
import { WalletController } from './wallet.controller';
import { WalletCallbacksController } from './wallet-callbacks.controller';
import { WalletService } from './wallet.service';
import { WalletJwtGuard } from './wallet-jwt.guard';
import { CashierRoleGuard } from './cashier-role.guard';

const FALLBACK_SECRET = 'dev-secret-change-in-prod';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('WALLET_JWT_SECRET') ??
          config.get<string>('JWT_SECRET') ??
          FALLBACK_SECRET,
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [WalletAuthController, WalletController, WalletCallbacksController],
  providers: [WalletAuthService, WalletService, WalletJwtGuard, CashierRoleGuard],
  exports: [CashierRoleGuard],
})
export class WalletModule {}
