import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Market } from '../../common/types/market.enum';
import { AccountType } from '../../common/types/account-type.enum';

describe('AuthService', () => {
  const user = { id: 'u1', phoneNumber: '+242060000123', market: Market.CONGO, accountType: AccountType.STANDARD };
  const makeSvc = (storedOtp: string | null) => {
    const redis = { get: jest.fn().mockResolvedValue(storedOtp), set: jest.fn(), del: jest.fn() };
    const jwt = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token'), verifyAsync: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('x') };
    const users = { findByPhone: jest.fn().mockResolvedValue(user), touchLogin: jest.fn(), createIfAbsent: jest.fn() };
    const notify = { sendSms: jest.fn().mockResolvedValue({ id: 'x' }), sendEmail: jest.fn().mockResolvedValue({ id: 'x' }) };
    return { svc: new AuthService(redis as never, jwt as never, config as never, users as never, notify as never), redis, jwt, users };
  };

  it('rejects a wrong OTP', async () => {
    const { svc } = makeSvc('123456');
    await expect(svc.verifyOtp({ phoneNumber: user.phoneNumber, otp: '000000' })).rejects.toThrow(UnauthorizedException);
  });

  it('issues access + refresh tokens on a correct OTP and consumes it', async () => {
    const { svc, redis, users } = makeSvc('123456');
    const res = await svc.verifyOtp({ phoneNumber: user.phoneNumber, otp: '123456' });
    expect(res.accessToken).toBeDefined();
    expect(res.refreshToken).toBeDefined();
    expect(res.user.sub).toBe('u1');
    expect(redis.del).toHaveBeenCalledWith(`otp:${user.phoneNumber}`); // OTP is single-use
    expect(users.touchLogin).toHaveBeenCalledWith('u1');
  });
});
