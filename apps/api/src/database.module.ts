import { Global, Module } from '@nestjs/common';
import { prisma, withLivemodeGuard } from '@paybrain/database';

// Client muni du garde livemode : aucune requête de liste sur une table
// test/live ne peut oublier le mode (§4.6).
const guardedPrisma = withLivemodeGuard(prisma);

@Global()
@Module({
  providers: [{ provide: 'PRISMA', useValue: guardedPrisma }],
  exports: ['PRISMA'],
})
export class DatabaseModule {}
