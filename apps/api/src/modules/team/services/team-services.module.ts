import { Module } from '@nestjs/common';
import { MessagingModule } from '../../messaging/messaging.module';
import { MemberEventsService } from './member-events.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { OwnershipService } from './ownership.service';

/**
 * Services transactionnels de l'équipe marchand (consommés par TeamModule).
 * Les invitations partent par le service de messages (M9) ; SessionService
 * et AuditService sont globaux.
 */
@Module({
  imports: [MessagingModule],
  providers: [MemberEventsService, MembersService, InvitationsService, OwnershipService],
  exports: [MemberEventsService, MembersService, InvitationsService, OwnershipService],
})
export class TeamServicesModule {}
