import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MembersService } from './services/members.service';

/**
 * Lecture seule pour le mobile (décision 2A) : le RN Expo n'embarque PAS
 * Clerk, il s'authentifie déjà par clé API. Le marchand est résolu depuis la
 * clé (req.merchant, posé par ApiKeyGuard) — jamais depuis un paramètre client.
 */
@ApiTags('Équipe marchand — mobile (lecture seule)')
@ApiSecurity('ApiKey')
@Controller('v1/team/members')
@UseGuards(ApiKeyGuard)
export class TeamMembersReadonlyController {
  constructor(private readonly members: MembersService) {}

  @Get()
  list(@Req() req: any) {
    return this.members.list(req.merchant.id);
  }
}
