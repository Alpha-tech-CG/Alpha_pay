import { Module } from '@nestjs/common';
import { TeamAuthModule } from './auth/team-auth.module';
import { TeamServicesModule } from './services/team-services.module';
import { TeamController } from './team.controller';
import { InvitationsController } from './invitations.controller';
import { InvitationsPublicController } from './invitations-public.controller';
import { OwnershipController } from './ownership.controller';
import { TeamMembersReadonlyController } from './team-members-readonly.controller';
import { MyMerchantsController } from './my-merchants.controller';

@Module({
  imports: [TeamAuthModule, TeamServicesModule],
  controllers: [
    TeamController,
    InvitationsController,
    InvitationsPublicController,
    OwnershipController,
    TeamMembersReadonlyController,
    MyMerchantsController,
  ],
})
export class TeamModule {}
