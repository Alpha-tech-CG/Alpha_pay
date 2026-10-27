import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { SessionGuard } from '../auth/session.guard';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { ProviderConnectionsService } from './provider-connections.service';

class SaveConnectionDto {
  @ApiProperty({ example: { subscriptionKey: '…', apiUserId: '…', apiKey: '…' }, description: 'Identifiants API du compte opérateur du marchand.' })
  @IsObject()
  credentials!: Record<string, unknown>;
}

enum Mode {
  test = 'test',
  live = 'live',
}

/**
 * Comptes opérateur du marchand (§4.3, T-40) : propriétaire et
 * administrateurs seulement (`providers:manage`), contrôlé côté serveur.
 */
@ApiTags('Comptes opérateur')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/provider-connections')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard)
export class ProviderConnectionsController {
  constructor(private readonly connections: ProviderConnectionsService) {}

  @Get()
  @RequireAction('providers:manage')
  @ApiOperation({ summary: 'État des comptes MTN et Airtel (test et live)' })
  async list(@Param('merchantId') merchantId: string) {
    return { data: await this.connections.list(merchantId) };
  }

  @Put(':operator')
  @RequireAction('providers:manage')
  @ApiOperation({ summary: 'Connecter (ou remplacer) un compte opérateur, puis le vérifier' })
  save(
    @Param('merchantId') merchantId: string,
    @Param('operator') operator: string,
    @Query('mode', new ParseEnumPipe(Mode)) mode: Mode,
    @Body() dto: SaveConnectionDto,
    @Req() req: any,
  ) {
    return this.connections.save(merchantId, operator, mode === Mode.live, dto.credentials, { userId: req.appUser.id, ip: req.ip });
  }

  @Post(':operator/verify')
  @HttpCode(200)
  @RequireAction('providers:manage')
  @ApiOperation({ summary: 'Revérifier un compte opérateur' })
  verify(@Param('merchantId') merchantId: string, @Param('operator') operator: string, @Query('mode', new ParseEnumPipe(Mode)) mode: Mode, @Req() req: any) {
    return this.connections.verify(merchantId, operator, mode === Mode.live, { userId: req.appUser.id, ip: req.ip });
  }

  @Delete(':operator')
  @RequireAction('providers:manage')
  @ApiOperation({ summary: 'Déconnecter un compte opérateur (identifiants effacés)' })
  disable(@Param('merchantId') merchantId: string, @Param('operator') operator: string, @Query('mode', new ParseEnumPipe(Mode)) mode: Mode, @Req() req: any) {
    return this.connections.disable(merchantId, operator, mode === Mode.live, { userId: req.appUser.id, ip: req.ip });
  }
}
