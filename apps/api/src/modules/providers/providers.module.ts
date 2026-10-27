import { Global, Module } from '@nestjs/common';
import { MobileMoneyRegistry, TOKEN_CACHE } from './mobile-money.registry';
import { createTokenCache } from './redis-token-cache';

/** Registre des fournisseurs externes (T-06), disponible dans toute l'API. */
@Global()
@Module({
  providers: [{ provide: TOKEN_CACHE, useFactory: createTokenCache }, MobileMoneyRegistry],
  exports: [MobileMoneyRegistry],
})
export class ProvidersModule {}
