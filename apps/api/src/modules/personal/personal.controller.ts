import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from '../auth/session.guard';
import { AccountDto, ContributionDto, EntryDto, EnvelopeDto, GoalDto, PaymentRequestDto, SettingsDto, SetupDto, TransferDto, UpdateAccountDto, UpdateEntryDto, UpdateEnvelopeDto, UpdateGoalDto } from './personal.dto';
import { PersonalService } from './personal.service';

/** Espace particulier (D-065) : budget, épargne suivie, identifiant AlphaPay. Session utilisateur. */
@ApiTags('Espace particulier')
@ApiSecurity('Bearer')
@Controller('v1/personal')
@UseGuards(SessionGuard)
export class PersonalController {
  constructor(private readonly personal: PersonalService) {}

  @Post('activate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Active l’espace particulier et crée l’identifiant AlphaPay' })
  activate(@Req() req: any) {
    return this.personal.activate(req.appUser.id);
  }

  @Get()
  @ApiOperation({ summary: 'Vue unifiée : soldes, dépenses, épargne, reste à dépenser, enveloppes, objectifs' })
  overview(@Req() req: any, @Query('month') month?: string) {
    return this.personal.overview(req.appUser.id, month);
  }

  @Get('setup/suggestion')
  @ApiOperation({ summary: 'Budget de départ proposé à partir du revenu' })
  suggestion(@Query('income') income?: string) {
    return this.personal.suggestion(Math.max(0, Math.min(50_000_000, Number(income) || 0)));
  }

  @Put('setup')
  setup(@Req() req: any, @Body() dto: SetupDto) {
    return this.personal.setup(req.appUser.id, dto);
  }

  @Patch('settings')
  settings(@Req() req: any, @Body() dto: SettingsDto) {
    return this.personal.updateSettings(req.appUser.id, dto);
  }

  @Post('accounts')
  createAccount(@Req() req: any, @Body() dto: AccountDto) {
    return this.personal.createAccount(req.appUser.id, dto);
  }

  @Patch('accounts/:id')
  updateAccount(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAccountDto) {
    return this.personal.updateAccount(req.appUser.id, id, dto);
  }

  @Delete('accounts/:id')
  deleteAccount(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.deleteAccount(req.appUser.id, id);
  }

  @Get('envelopes')
  envelopes(@Req() req: any, @Query('month') month?: string) {
    return this.personal.envelopes(req.appUser.id, month);
  }

  @Post('envelopes')
  createEnvelope(@Req() req: any, @Body() dto: EnvelopeDto) {
    return this.personal.createEnvelope(req.appUser.id, dto);
  }

  @Patch('envelopes/:id')
  updateEnvelope(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEnvelopeDto) {
    return this.personal.updateEnvelope(req.appUser.id, id, dto);
  }

  @Delete('envelopes/:id')
  deleteEnvelope(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.deleteEnvelope(req.appUser.id, id);
  }

  @Get('categorize')
  @ApiOperation({ summary: 'Catégorie proposée pour un libellé (règles apprises, puis mots-clés)' })
  categorize(@Req() req: any, @Query('label') label = '', @Query('direction') direction = 'out') {
    return this.personal.categorize(req.appUser.id, label.slice(0, 80), direction === 'in' ? 'IN' : 'OUT');
  }

  @Get('entries')
  entries(@Req() req: any, @Query('month') month?: string, @Query('envelope_id') envelopeId?: string) {
    return this.personal.entries(req.appUser.id, month, envelopeId);
  }

  @Post('entries')
  createEntry(@Req() req: any, @Body() dto: EntryDto) {
    return this.personal.createEntry(req.appUser.id, dto);
  }

  @Patch('entries/:id')
  @ApiOperation({ summary: 'Corriger la catégorie ou l’enveloppe ; le choix est retenu pour ce libellé' })
  updateEntry(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEntryDto) {
    return this.personal.updateEntry(req.appUser.id, id, dto);
  }

  @Delete('entries/:id')
  deleteEntry(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.deleteEntry(req.appUser.id, id);
  }

  @Get('goals')
  goals(@Req() req: any) {
    return this.personal.goals(req.appUser.id);
  }

  @Post('goals')
  createGoal(@Req() req: any, @Body() dto: GoalDto) {
    return this.personal.createGoal(req.appUser.id, dto);
  }

  @Patch('goals/:id')
  updateGoal(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGoalDto) {
    return this.personal.updateGoal(req.appUser.id, id, dto);
  }

  @Delete('goals/:id')
  archiveGoal(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.archiveGoal(req.appUser.id, id);
  }

  @Post('goals/:id/contributions')
  @ApiOperation({ summary: 'Versement (positif) ou retrait (négatif) suivi sur un objectif' })
  contribute(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContributionDto) {
    return this.personal.contribute(req.appUser.id, id, dto);
  }

  @Get('alerts')
  alerts(@Req() req: any) {
    return this.personal.alerts(req.appUser.id);
  }

  @Post('alerts/read')
  @HttpCode(200)
  readAll(@Req() req: any) {
    return this.personal.readAlerts(req.appUser.id);
  }

  @Get('report')
  @ApiOperation({ summary: 'Rapport mensuel : revenus, dépenses, épargne, envois, principales dépenses, conseil' })
  report(@Req() req: any, @Query('month') month?: string) {
    return this.personal.report(req.appUser.id, month);
  }

  @Get('directory')
  @ApiOperation({ summary: 'Bénéficiaire par identifiant AlphaPay ou numéro (affiché avant confirmation)' })
  lookup(@Req() req: any, @Query('to') to = '') {
    return this.personal.lookup(req.appUser.id, to).then(({ user_id: _id, ...rest }) => rest);
  }

  @Get('transfers')
  transfers(@Req() req: any) {
    return this.personal.transfers(req.appUser.id);
  }

  @Post('transfers')
  @HttpCode(201)
  @ApiOperation({ summary: 'Déclare un envoi AlphaPay (de MoMo à MoMo, hors AlphaPay) ; Idempotency-Key obligatoire' })
  transfer(@Req() req: any, @Body() dto: TransferDto, @Headers('idempotency-key') key?: string) {
    return this.personal.declareTransfer(req.appUser.id, dto, key ?? '');
  }

  @Post('transfers/:id/confirm')
  @HttpCode(200)
  confirm(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.confirmTransfer(req.appUser.id, id);
  }

  @Post('transfers/:id/dispute')
  @HttpCode(200)
  dispute(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.disputeTransfer(req.appUser.id, id);
  }

  @Post('transfers/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.cancelTransfer(req.appUser.id, id);
  }

  @Get('requests')
  requests(@Req() req: any) {
    return this.personal.myRequests(req.appUser.id);
  }

  @Post('requests')
  createRequest(@Req() req: any, @Body() dto: PaymentRequestDto) {
    return this.personal.createRequest(req.appUser.id, dto);
  }

  @Get('requests/:code')
  request(@Param('code') code: string) {
    return this.personal.request(code.slice(0, 20));
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancelRequest(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.personal.cancelRequest(req.appUser.id, id);
  }
}
