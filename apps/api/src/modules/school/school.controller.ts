import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../auth/session.guard';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import {
  CreateClassDto,
  CreateFeeGridDto,
  CreateSchoolYearDto,
  CreateStudentDto,
  GuardianDto,
  SchoolService,
} from './school.service';

@Controller('v1/merchants/:merchantId/school')
@UseGuards(SessionGuard, RequireMemberGuard)
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  dashboard(@Param('merchantId') _mid: string, @Req() req: any) {
    const { merchantId } = req.membership;
    return this.school.dashboard(merchantId);
  }

  // ─── Années scolaires ──────────────────────────────────────────────────────

  @Post('years')
  createYear(@Param('merchantId') _mid: string, @Req() req: any, @Body() body: CreateSchoolYearDto) {
    const { merchantId } = req.membership;
    return this.school.createYear(merchantId, body);
  }

  @Get('years')
  listYears(@Param('merchantId') _mid: string, @Req() req: any) {
    const { merchantId } = req.membership;
    return this.school.listYears(merchantId);
  }

  @Post('years/:yearId/activate')
  activateYear(
    @Param('merchantId') _mid: string,
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.school.activateYear(merchantId, yearId);
  }

  // ─── Classes ───────────────────────────────────────────────────────────────

  @Post('years/:yearId/classes')
  createClass(
    @Param('merchantId') _mid: string,
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Req() req: any,
    @Body() body: CreateClassDto,
  ) {
    const { merchantId } = req.membership;
    return this.school.createClass(merchantId, yearId, body);
  }

  @Get('years/:yearId/classes')
  listClasses(
    @Param('merchantId') _mid: string,
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.school.listClasses(merchantId, yearId);
  }

  // ─── Élèves ────────────────────────────────────────────────────────────────

  @Post('students')
  createStudent(@Param('merchantId') _mid: string, @Req() req: any, @Body() body: CreateStudentDto) {
    const { merchantId } = req.membership;
    return this.school.createStudent(merchantId, body);
  }

  @Get('students')
  listStudents(
    @Param('merchantId') _mid: string,
    @Req() req: any,
    @Query('class_id') classId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const { merchantId } = req.membership;
    return this.school.listStudents(merchantId, classId, cursor, limit ? parseInt(limit) : 50);
  }

  @Get('students/:studentId')
  getStudent(
    @Param('merchantId') _mid: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    return this.school.getStudent(merchantId, studentId);
  }

  @Post('students/:studentId/guardians')
  addGuardian(
    @Param('merchantId') _mid: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Req() req: any,
    @Body() body: GuardianDto,
  ) {
    const { merchantId } = req.membership;
    return this.school.addGuardian(merchantId, studentId, body);
  }

  // ─── Import CSV (T-79) ─────────────────────────────────────────────────────

  @Post('classes/:classId/import-csv')
  importCsv(
    @Param('merchantId') _mid: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Req() req: any,
    @Body() body: { csv: string },
  ) {
    const { merchantId } = req.membership;
    return this.school.importCsv(merchantId, classId, body.csv ?? '');
  }

  // ─── Grilles de frais ──────────────────────────────────────────────────────

  @Post('years/:yearId/fee-grids')
  createFeeGrid(
    @Param('merchantId') _mid: string,
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Req() req: any,
    @Body() body: CreateFeeGridDto,
  ) {
    const { merchantId } = req.membership;
    return this.school.createFeeGrid(merchantId, yearId, body);
  }

  @Post('fee-grids/:feeGridId/apply')
  applyFeeGrid(
    @Param('merchantId') _mid: string,
    @Param('feeGridId', ParseUUIDPipe) feeGridId: string,
    @Req() req: any,
  ) {
    const { merchantId } = req.membership;
    const livemode = req.livemode ?? false;
    return this.school.applyFeeGrid(merchantId, feeGridId, livemode);
  }
}
