import { Module } from '@nestjs/common';
import { MemberEventsService } from './member-events.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { OwnershipService } from './ownership.service';

/**
 * Services transactionnels équipe marchand (étape B du handoff). Pas de
 * controllers ici — à consommer par `TeamModule` (étape C). NotificationService
 * est fourni par `NotificationModule`, qui est `@Global()` : pas besoin de
 * l'importer explicitement.
 */
@Module({
  providers: [MemberEventsService, MembersService, InvitationsService, OwnershipService],
  exports: [MemberEventsService, MembersService, InvitationsService, OwnershipService],
})
export class TeamServicesModule {}
