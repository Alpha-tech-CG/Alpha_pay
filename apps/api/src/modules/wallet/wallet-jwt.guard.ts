import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export interface WalletJwtPayload {
  sub: string;   // wallet id
  phone: string;
  role: string;
}

@Injectable()
export class WalletJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const auth: string | undefined = request.headers['authorization'];

    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token manquant');
    }

    const token = auth.slice(7);
    try {
      const secret = this.config.get<string>('WALLET_JWT_SECRET') ?? this.config.get<string>('JWT_SECRET');
      const payload = this.jwt.verify<WalletJwtPayload>(token, { secret });
      request.wallet = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }
}
