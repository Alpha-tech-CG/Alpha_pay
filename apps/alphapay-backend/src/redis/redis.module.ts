import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS = 'REDIS_CLIENT';

/** Single shared ioredis client, injectable everywhere via the REDIS token. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new Redis(config.get<string>('redis.url') ?? 'redis://localhost:6379'),
    },
  ],
  exports: [REDIS],
})
export class RedisModule {}
