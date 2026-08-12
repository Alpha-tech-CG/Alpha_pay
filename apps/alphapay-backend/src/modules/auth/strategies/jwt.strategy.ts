import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtUser } from '../../../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') ?? 'dev-secret',
    });
  }

  /** Passport attaches the return value to req.user. */
  validate(payload: JwtUser): JwtUser {
    return { sub: payload.sub, phone: payload.phone, market: payload.market, accountType: payload.accountType };
  }
}
