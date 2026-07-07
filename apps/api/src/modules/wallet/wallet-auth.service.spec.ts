import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { WalletAuthService } from './wallet-auth.service';
import { NotificationService } from '../notifications/notification.service';
import { MetricsService } from '../metrics/metrics.service';

type PrismaMock = {
  wallet: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function makeService() {
  const prisma: PrismaMock = {
    wallet: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const jwt = { sign: jest.fn().mockReturnValue('jwt-token') } as unknown as JwtService;
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const notifications = { send: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationService;
  const metrics = {
    walletPinFailuresTotal: { inc: jest.fn() },
  } as unknown as MetricsService;

  const service = new WalletAuthService(
    prisma as never, jwt, config, notifications, metrics,
  );
  return { service, prisma, jwt, notifications, metrics };
}

const BASE_WALLET = {
  id: 'w1',
  phone: '242066000001',
  role: 'CLIENT',
  status: 'ACTIVE',
  failedPinAttempts: 0,
  lockedUntil: null,
  otpHash: null,
  otpExpiresAt: null,
  otpAttempts: 0,
};

describe('WalletAuthService — OTP inscription (ALP-171)', () => {
  it("crée un wallet PENDING_VERIFICATION et envoie l'OTP par SMS", async () => {
    const { service, prisma, notifications } = makeService();
    prisma.wallet.findUnique.mockResolvedValue(null);
    prisma.wallet.create.mockResolvedValue({ id: 'w1', phone: '242066000001' });

    const res = await service.register({ phone: '242066000001', fullName: 'Test', pin: '1234' });

    expect(res).toMatchObject({ ok: true, requiresVerification: true });
    expect(prisma.wallet.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'PENDING_VERIFICATION',
        otpHash: expect.any(String),
        otpExpiresAt: expect.any(Date),
      }),
    }));
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
      template: 'wallet.otp',
      data: { otp: expect.stringMatching(/^[0-9]{6}$/) },
    }));
  });

  it('rejette un numéro déjà vérifié (Conflict)', async () => {
    const { service, prisma } = makeService();
    prisma.wallet.findUnique.mockResolvedValue({ ...BASE_WALLET, status: 'ACTIVE' });

    await expect(
      service.register({ phone: '242066000001', fullName: 'X', pin: '1234' }),
    ).rejects.toThrow(ConflictException);
  });

  it('permet de ré-enregistrer un numéro jamais vérifié (anti-préemption)', async () => {
    const { service, prisma } = makeService();
    prisma.wallet.findUnique.mockResolvedValue({ ...BASE_WALLET, status: 'PENDING_VERIFICATION' });
    prisma.wallet.update.mockResolvedValue({ id: 'w1', phone: '242066000001' });

    const res = await service.register({ phone: '242066000001', fullName: 'Vrai Titulaire', pin: '9999' });

    expect(res.ok).toBe(true);
    expect(prisma.wallet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ fullName: 'Vrai Titulaire', otpAttempts: 0 }),
    }));
  });

  it('verifyOtp active le compte et retourne un token', async () => {
    const { service, prisma, jwt } = makeService();
    const otpHash = await argon2.hash('123456', { type: argon2.argon2id });
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET,
      status: 'PENDING_VERIFICATION',
      otpHash,
      otpExpiresAt: new Date(Date.now() + 60_000),
    });
    prisma.wallet.update.mockResolvedValue({});

    const res = await service.verifyOtp({ phone: '242066000001', otp: '123456' });

    expect(res).toMatchObject({ ok: true, token: 'jwt-token' });
    expect(prisma.wallet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ACTIVE', otpHash: null }),
    }));
    expect(jwt.sign).toHaveBeenCalled();
  });

  it('verifyOtp incrémente les tentatives sur code faux et rejette', async () => {
    const { service, prisma } = makeService();
    const otpHash = await argon2.hash('123456', { type: argon2.argon2id });
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET,
      status: 'PENDING_VERIFICATION',
      otpHash,
      otpExpiresAt: new Date(Date.now() + 60_000),
    });
    prisma.wallet.update.mockResolvedValue({});

    await expect(service.verifyOtp({ phone: '242066000001', otp: '000000' }))
      .rejects.toThrow(/incorrect/i);
    expect(prisma.wallet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { otpAttempts: { increment: 1 } },
    }));
  });

  it('verifyOtp rejette un code expiré et après 3 tentatives', async () => {
    const { service, prisma } = makeService();
    const otpHash = await argon2.hash('123456', { type: argon2.argon2id });

    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, status: 'PENDING_VERIFICATION', otpHash,
      otpExpiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.verifyOtp({ phone: '242066000001', otp: '123456' }))
      .rejects.toThrow(/expiré/i);

    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, status: 'PENDING_VERIFICATION', otpHash,
      otpExpiresAt: new Date(Date.now() + 60_000), otpAttempts: 3,
    });
    await expect(service.verifyOtp({ phone: '242066000001', otp: '123456' }))
      .rejects.toThrow(/tentatives/i);
  });

  it('resendOtp répond ok sans révéler si le numéro existe', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.wallet.findUnique.mockResolvedValue(null);

    const res = await service.resendOtp({ phone: '242060000000' });
    expect(res).toEqual({ ok: true });
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('WalletAuthService — verrouillage PIN (ALP-173)', () => {
  it('bloque la connexion tant que lockedUntil est dans le futur, même avec le bon PIN', async () => {
    const { service, prisma, metrics } = makeService();
    const pinHash = await argon2.hash('1234', { type: argon2.argon2id });
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, pinHash,
      lockedUntil: new Date(Date.now() + 10 * 60_000),
    });

    await expect(service.verifyPin('242066000001', '1234'))
      .rejects.toThrow(/verrouillé/i);
    expect((metrics.walletPinFailuresTotal.inc as jest.Mock))
      .toHaveBeenCalledWith({ result: 'locked' });
  });

  it('verrouille 15 min au 5e échec et envoie un SMS d\'alerte', async () => {
    const { service, prisma, notifications, metrics } = makeService();
    const pinHash = await argon2.hash('1234', { type: argon2.argon2id });
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, pinHash, failedPinAttempts: 4,
    });
    prisma.wallet.update.mockResolvedValue({});

    await expect(service.verifyPin('242066000001', '0000'))
      .rejects.toThrow(UnauthorizedException);

    const updateArgs = prisma.wallet.update.mock.calls[0][0];
    expect(updateArgs.data.failedPinAttempts).toEqual({ increment: 1 });
    const lockedUntil: Date = updateArgs.data.lockedUntil;
    const minutes = (lockedUntil.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15.1);

    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
      template: 'wallet.locked',
    }));
    expect((metrics.walletPinFailuresTotal.inc as jest.Mock))
      .toHaveBeenCalledWith({ result: 'invalid' });
  });

  it('ne verrouille pas avant le 5e échec', async () => {
    const { service, prisma, notifications } = makeService();
    const pinHash = await argon2.hash('1234', { type: argon2.argon2id });
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, pinHash, failedPinAttempts: 1,
    });
    prisma.wallet.update.mockResolvedValue({});

    await expect(service.verifyPin('242066000001', '0000')).rejects.toThrow();
    const updateArgs = prisma.wallet.update.mock.calls[0][0];
    expect(updateArgs.data.lockedUntil).toBeUndefined();
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('verrouille 24 h à partir du 15e échec', async () => {
    const { service, prisma } = makeService();
    const pinHash = await argon2.hash('1234', { type: argon2.argon2id });
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, pinHash, failedPinAttempts: 14,
    });
    prisma.wallet.update.mockResolvedValue({});

    await expect(service.verifyPin('242066000001', '0000')).rejects.toThrow();
    const lockedUntil: Date = prisma.wallet.update.mock.calls[0][0].data.lockedUntil;
    const hours = (lockedUntil.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
  });

  it('remet le compteur à zéro après une connexion réussie', async () => {
    const { service, prisma } = makeService();
    const pinHash = await argon2.hash('1234', { type: argon2.argon2id });
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, pinHash, failedPinAttempts: 3,
      lockedUntil: new Date(Date.now() - 1000), // verrou expiré
    });
    prisma.wallet.update.mockResolvedValue({});

    const wallet = await service.verifyPin('242066000001', '1234');
    expect(wallet.id).toBe('w1');
    expect(prisma.wallet.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { failedPinAttempts: 0, lockedUntil: null },
    }));
  });

  it('rejette un compte non vérifié avec un message explicite', async () => {
    const { service, prisma } = makeService();
    prisma.wallet.findUnique.mockResolvedValue({
      ...BASE_WALLET, status: 'PENDING_VERIFICATION',
    });

    await expect(service.verifyPin('242066000001', '1234'))
      .rejects.toThrow(/non vérifié/i);
  });
});
