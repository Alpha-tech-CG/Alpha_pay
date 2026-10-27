import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { MembersService } from './services/members.service';

/**
 * Résout les marchands de l'utilisateur connecté — SANS `:merchantId` dans le
 * path (donc PAS de RequireMemberGuard, qui l'exige). Utilisé par le
 * dashboard pour savoir sur quel marchand agir avant tout autre appel.
 */
@ApiTags('Équipe marchand — moi')
@ApiSecurity('Bearer')
@Controller('v1/me/merchants')
@UseGuards(SessionGuard)
export class MyMerchantsController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@Req() req: any) {
    return this.members.listForUser(req.appUser.id);
  }
}
