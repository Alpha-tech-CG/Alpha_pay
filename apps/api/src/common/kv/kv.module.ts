import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { KvStore, MemoryKvStore, RedisKvStore } from './kv-store';

const REDIS_CLIENT = Symbol('KV_REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) return null;
        const client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
        client.on('error', () => undefined); // signalé par /ready
        return client;
      },
    },
    {
      provide: KvStore,
      inject: [REDIS_CLIENT],
      useFactory: (client: Redis | null) => {
        if (client) return new RedisKvStore(client);
        if (process.env.NODE_ENV === 'production') throw new Error('REDIS_URL requis (OTP, limites)');
        return new MemoryKvStore();
      },
    },
  ],
  exports: [KvStore],
})
export class KvModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  async onApplicationShutdown() {
    await this.client?.quit().catch(() => undefined);
  }
}
