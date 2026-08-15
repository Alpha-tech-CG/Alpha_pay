import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ClerkSessionGuard } from './auth/clerk-session.guard';
import { InvitationsService } from './services/invitations.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

/**
 * Routes publiques (page /invite?token=...) : PAS de RequireMemberGuard —
 * l'invité n'a par définition pas encore de membership sur ce marchand.
 */
@ApiTags('Invitations')
@Controller('v1/invitations')
export class InvitationsPublicController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Aperçu sans authentification : email masqué, aucune donnée sensible. */
  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  /** Authentifié Clerk uniquement (pas de membership requis pour accepter). */
  @Post('accept')
  @ApiSecurity('Bearer')
  @UseGuards(ClerkSessionGuard)
  accept(@Body() dto: AcceptInvitationDto, @Req() req: any) {
    return this.invitations.accept(dto.token, req.appUser);
  }
}
