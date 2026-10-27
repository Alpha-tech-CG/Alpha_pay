import { Controller, Get, HttpCode, Inject, OnModuleDestroy, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import Redis from 'ioredis';
import { PrismaClient } from '@paybrain/database';

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), CHECK_TIMEOUT_MS).unref()),
  ]);
}

/** Sondes publiques (§8.2) : `/health` vivant, `/ready` base et Redis joignables. */
@ApiTags('Santé')
@Controller()
export class HealthController implements OnModuleDestroy {
  private redis: Redis | null = null;

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  @Get('health')
  @HttpCode(200)
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const ok = database === 'ok' && redis !== 'ko';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'ko', checks: { database, redis } };
  }

  private async checkDatabase(): Promise<'ok' | 'ko'> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`);
      return 'ok';
    } catch {
      return 'ko';
    }
  }

  /** Sans REDIS_URL (dev, tests), Redis n'est pas requis : « non_configure ». */
  private async checkRedis(): Promise<'ok' | 'ko' | 'non_configure'> {
    const url = process.env.REDIS_URL;
    if (!url) return 'non_configure';
    try {
      this.redis ??= new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false });
      if (this.redis.status === 'wait') await withTimeout(this.redis.connect());
      return (await withTimeout(this.redis.ping())) === 'PONG' ? 'ok' : 'ko';
    } catch {
      return 'ko';
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
