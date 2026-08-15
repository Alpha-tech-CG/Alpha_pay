import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service';

// Global comme DatabaseModule/NotificationModule : UsersService est une
// dépendance transversale (webhook Clerk, guards team/auth) consommée par
// des modules qui n'ont pas de lien d'import direct entre eux.
@Global()
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
