import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MessagingModule } from '../messaging/messaging.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET (≥32 caractères) requis en production');
  return 'dev-only-jwt-secret-not-for-production-000000';
}

/** M1 — Comptes : inscription, connexion mot de passe + code, sessions révocables. */
@Global()
@Module({
  imports: [
    MessagingModule,
    JwtModule.registerAsync({
      useFactory: () => ({ secret: jwtSecret(), signOptions: { algorithm: 'HS256', issuer: 'alphapay' }, verifyOptions: { algorithms: ['HS256'], issuer: 'alphapay' } }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionService, SessionGuard],
  exports: [SessionService, SessionGuard],
})
export class AuthModule {}
