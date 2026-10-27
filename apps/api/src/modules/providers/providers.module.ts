import { Global, Module } from '@nestjs/common';
import { TeamAuthModule } from '../team/auth/team-auth.module';
import { MOBILE_MONEY_HTTP, MobileMoneyRegistry, TOKEN_CACHE } from './mobile-money.registry';
import { ProviderConnectionsController } from './provider-connections.controller';
import { ProviderConnectionsService } from './provider-connections.service';
import { createTokenCache } from './redis-token-cache';

/** Fournisseurs externes (T-06) et comptes opérateur des marchands (T-40). */
@Global()
@Module({
  imports: [TeamAuthModule],
  controllers: [ProviderConnectionsController],
  providers: [
    { provide: TOKEN_CACHE, useFactory: createTokenCache },
    { provide: MOBILE_MONEY_HTTP, useValue: null },
    MobileMoneyRegistry,
    ProviderConnectionsService,
  ],
  exports: [MobileMoneyRegistry],
})
export class ProvidersModule {}
