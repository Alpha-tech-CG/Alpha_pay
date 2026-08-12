import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS } from '../../redis/redis.module';
import { UsersService } from '../users/users.service';
import { JwtUser } from '../../common/decorators/current-user.decorator';
import { RegisterDto, VerifyOtpDto } from './dto/auth.dto';
import { NOTIFICATION_CONNECTOR, NotificationConnector } from '../../connectors/notifications/notification.connector';

const DEV_OTP = '123456';
const OTP_TTL = 300; // 5 min

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly users: UsersService,
    @Inject(NOTIFICATION_CONNECTOR) private readonly notify: NotificationConnector,
  ) {}

  /** Sends OTP. Stub: always "123456" in dev, stored in Redis with a TTL. */
  async register(dto: RegisterDto): Promise<{ ok: true; otpHint?: string }> {
    await this.users.createIfAbsent(dto.phoneNumber, dto.market);
    await this.redis.set(`otp:${dto.phoneNumber}`, DEV_OTP, 'EX', OTP_TTL);
    await this.notify.sendSms(dto.phoneNumber, `Votre code de vérification AlphaPay est ${DEV_OTP}. Valable 5 minutes.`);
    return { ok: true, otpHint: this.config.get('nodeEnv') === 'production' ? undefined : DEV_OTP };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const stored = await this.redis.get(`otp:${dto.phoneNumber}`);
    if (!stored || stored !== dto.otp) throw new UnauthorizedException('Invalid or expired OTP');
    await this.redis.del(`otp:${dto.phoneNumber}`);

    const user = await this.users.findByPhone(dto.phoneNumber);
    if (!user) throw new UnauthorizedException('User not found');
    await this.users.touchLogin(user.id);

    return this.issueTokens({ sub: user.id, phone: user.phoneNumber, market: user.market, accountType: user.accountType });
  }

  async refresh(refreshToken: string) {
    let payload: JwtUser & { jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, { secret: this.config.get('jwt.refreshSecret') });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const exists = await this.redis.get(`refresh:${payload.sub}:${payload.jti}`);
    if (!exists) throw new UnauthorizedException('Refresh token revoked');

    const access = await this.signAccess({ sub: payload.sub, phone: payload.phone, market: payload.market, accountType: payload.accountType });
    return { accessToken: access };
  }

  async logout(userId: string, refreshToken: string): Promise<{ ok: true }> {
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string }>(refreshToken, { secret: this.config.get('jwt.refreshSecret') });
      await this.redis.del(`refresh:${userId}:${payload.jti}`);
    } catch {
      /* already invalid — nothing to revoke */
    }
    return { ok: true };
  }

  private async issueTokens(user: JwtUser) {
    const jti = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.signAccess(user),
      this.jwt.signAsync(
        { ...user, jti },
        { secret: this.config.get('jwt.refreshSecret'), expiresIn: this.config.get('jwt.refreshExpiresIn') },
      ),
    ]);
    // 7-day TTL to auto-expire the Redis record alongside the token
    await this.redis.set(`refresh:${user.sub}:${jti}`, '1', 'EX', 7 * 24 * 3600);
    return { accessToken, refreshToken, user };
  }

  private signAccess(user: JwtUser) {
    return this.jwt.signAsync(user, {
      secret: this.config.get('jwt.accessSecret'),
      expiresIn: this.config.get('jwt.accessExpiresIn'),
    });
  }
}
