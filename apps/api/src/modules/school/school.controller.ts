import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiProduces, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiError } from '../../common/errors/api-error';
import { parseLimit } from '../../common/pagination/cursor';
import { ModuleAccessGuard, RequireModule } from '../billing/module-access.guard';
import { SessionGuard } from '../auth/session.guard';
import { InvoiceActor } from '../invoicing/invoices.service';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { CreateClassDto, CreateFeeGridDto, CreateSchoolYearDto, CreateStudentDto, GuardianDto, UpdateStudentDto } from './school.dto';
import { importTemplate } from './school-import';
import { SchoolService } from './school.service';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const live = (mode?: string) => mode === 'live';
const actor = (req: any): InvoiceActor => ({ type: 'user', id: req.appUser.id, ip: req.ip });

/**
 * Pack École (§M8). Lecture : propriétaire, administrateur, comptable ;
 * gestion : propriétaire et administrateur (contrôle CÔTÉ SERVEUR).
 */
@ApiTags('Pack École (tableau de bord)')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/school')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard, ModuleAccessGuard)
@RequireModule('m8_school')
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  // ─── Tableau de bord ───────────────────────────────────────────────────────

  @Get('dashboard')
  @RequireAction('school:view')
  @ApiOperation({ summary: 'Encaissé, attendu, impayés de l’année, par classe' })
  dashboard(@Param('merchantId') merchantId: string, @Query('mode') mode?: string, @Query('year_id') yearId?: string) {
    return this.school.dashboard(merchantId, live(mode), yearId);
  }

  @Get('late-students')
  @RequireAction('school:view')
  late(@Param('merchantId') merchantId: string, @Query('mode') mode?: string, @Query('year_id') yearId?: string, @Query('class_id') classId?: string) {
    return this.school.lateStudents(merchantId, live(mode), { yearId, classId });
  }

  @Get('late-students.csv')
  @RequireAction('school:view')
  @ApiProduces('text/csv')
  async lateCsv(@Param('merchantId') merchantId: string, @Res() res: any, @Query('mode') mode?: string, @Query('year_id') yearId?: string, @Query('class_id') classId?: string) {
    const csv = await this.school.lateStudentsCsv(merchantId, live(mode), { yearId, classId });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="retardataires.csv"', 'Cache-Control': 'no-store' });
    res.send(csv);
  }

  // ─── Années ────────────────────────────────────────────────────────────────

  @Post('years')
  @RequireAction('school:manage')
  createYear(@Param('merchantId') merchantId: string, @Body() dto: CreateSchoolYearDto) {
    return this.school.createYear(merchantId, dto);
  }

  @Get('years')
  @RequireAction('school:view')
  listYears(@Param('merchantId') merchantId: string) {
    return this.school.listYears(merchantId);
  }

  @Post('years/:yearId/activate')
  @HttpCode(200)
  @RequireAction('school:manage')
  activateYear(@Param('merchantId') merchantId: string, @Param('yearId', ParseUUIDPipe) yearId: string) {
    return this.school.activateYear(merchantId, yearId);
  }

  // ─── Classes ───────────────────────────────────────────────────────────────

  @Post('years/:yearId/classes')
  @RequireAction('school:manage')
  createClass(@Param('merchantId') merchantId: string, @Param('yearId', ParseUUIDPipe) yearId: string, @Body() dto: CreateClassDto) {
    return this.school.createClass(merchantId, yearId, dto);
  }

  @Get('years/:yearId/classes')
  @RequireAction('school:view')
  listClasses(@Param('merchantId') merchantId: string, @Param('yearId', ParseUUIDPipe) yearId: string) {
    return this.school.listClasses(merchantId, yearId);
  }

  // ─── Élèves ────────────────────────────────────────────────────────────────

  @Post('students')
  @RequireAction('school:manage')
  createStudent(@Param('merchantId') merchantId: string, @Body() dto: CreateStudentDto) {
    return this.school.createStudent(merchantId, dto);
  }

  @Get('students')
  @RequireAction('school:view')
  listStudents(
    @Param('merchantId') merchantId: string,
    @Query('class_id') classId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('starting_after') startingAfter?: string,
  ) {
    return this.school.listStudents(merchantId, { classId, q, limit: parseLimit(limit, 50), startingAfter });
  }

  @Get('students/:studentId')
  @RequireAction('school:view')
  getStudent(@Param('merchantId') merchantId: string, @Param('studentId', ParseUUIDPipe) id: string, @Query('mode') mode?: string) {
    return this.school.getStudent(merchantId, id, live(mode));
  }

  @Patch('students/:studentId')
  @RequireAction('school:manage')
  updateStudent(@Param('merchantId') merchantId: string, @Param('studentId', ParseUUIDPipe) id: string, @Body() dto: UpdateStudentDto) {
    return this.school.updateStudent(merchantId, id, dto);
  }

  @Post('students/:studentId/guardians')
  @RequireAction('school:manage')
  addGuardian(@Param('merchantId') merchantId: string, @Param('studentId', ParseUUIDPipe) id: string, @Body() dto: GuardianDto) {
    return this.school.addGuardian(merchantId, id, dto);
  }

  @Delete('students/:studentId/guardians/:guardianId')
  @HttpCode(204)
  @RequireAction('school:manage')
  removeGuardian(@Param('merchantId') merchantId: string, @Param('studentId', ParseUUIDPipe) id: string, @Param('guardianId', ParseUUIDPipe) guardianId: string): Promise<void> {
    return this.school.removeGuardian(merchantId, id, guardianId);
  }

  @Post('students/:studentId/send-links')
  @HttpCode(200)
  @RequireAction('school:manage')
  @ApiOperation({ summary: 'Envoyer au responsable le lien de paiement de l’élève' })
  sendStudentLinks(@Param('merchantId') merchantId: string, @Param('studentId', ParseUUIDPipe) id: string, @Query('mode') mode?: string) {
    return this.school.sendLinks(merchantId, live(mode), { studentId: id });
  }

  // ─── Import (T-79) ─────────────────────────────────────────────────────────

  @Get('import-template')
  @RequireAction('school:view')
  @ApiProduces('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async template(@Query('format') format: string | undefined, @Res() res: any) {
    const f = format === 'xlsx' ? 'xlsx' : 'csv';
    res.set({
      'Content-Type': f === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="modele-import-eleves.${f}"`,
    });
    res.send(await importTemplate(f));
  }

  @Post('classes/:classId/import')
  @HttpCode(200)
  @RequireAction('school:manage')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importer les élèves d’une classe (CSV ou Excel) ; rapport d’erreurs ligne par ligne' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  importStudents(
    @Param('merchantId') merchantId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Req() req: any,
  ) {
    if (!file?.buffer?.length) throw new ApiError(HttpStatus.BAD_REQUEST, 'fichier_manquant', 'Joignez le fichier CSV ou Excel (champ « file »)', 'file');
    return this.school.importStudents(merchantId, classId, file, actor(req));
  }

  @Post('classes/:classId/send-links')
  @HttpCode(200)
  @RequireAction('school:manage')
  sendClassLinks(@Param('merchantId') merchantId: string, @Param('classId', ParseUUIDPipe) classId: string, @Query('mode') mode?: string) {
    return this.school.sendLinks(merchantId, live(mode), { classId });
  }

  // ─── Grilles de frais ──────────────────────────────────────────────────────

  @Post('years/:yearId/fee-grids')
  @RequireAction('school:manage')
  createFeeGrid(@Param('merchantId') merchantId: string, @Param('yearId', ParseUUIDPipe) yearId: string, @Body() dto: CreateFeeGridDto) {
    return this.school.createFeeGrid(merchantId, yearId, dto);
  }

  @Get('years/:yearId/fee-grids')
  @RequireAction('school:view')
  listFeeGrids(@Param('merchantId') merchantId: string, @Param('yearId', ParseUUIDPipe) yearId: string, @Query('mode') mode?: string) {
    return this.school.listFeeGrids(merchantId, yearId, live(mode));
  }

  @Post('fee-grids/:feeGridId/apply')
  @HttpCode(200)
  @RequireAction('school:manage')
  @ApiOperation({ summary: 'Générer les factures et échéanciers des élèves de la classe' })
  applyFeeGrid(@Param('merchantId') merchantId: string, @Param('feeGridId', ParseUUIDPipe) id: string, @Query('mode') mode: string | undefined, @Query('notify') notify: string | undefined, @Req() req: any) {
    return this.school.applyFeeGrid(merchantId, id, live(mode), actor(req), { notify: notify === 'true' });
  }
}
