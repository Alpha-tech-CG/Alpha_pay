import { Body, Controller, Delete, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiProduces, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiError } from '../../common/errors/api-error';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { SessionGuard } from '../auth/session.guard';
import { RequireActionGuard } from '../team/auth/require-action.guard';
import { RequireAction } from '../team/auth/require-action.decorator';
import { RequireMemberGuard } from '../team/auth/require-member.guard';
import { Actor, StoresService } from './stores.service';

class CreateStoreDto {
  @ApiProperty({ example: 'Boutique Poto-Poto' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;
}

class UpdateStoreDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(250) address?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class CreateTillDto {
  @ApiProperty({ example: 'Caisse 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

class UpdateTillDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ description: 'Confirmation Vérif par SMS (§M5)' })
  @IsOptional() @IsBoolean() confirmBySms?: boolean;
  @ApiPropertyOptional({ description: 'Confirmation Vérif par WhatsApp (§M5)' })
  @IsOptional() @IsBoolean() confirmByWhatsApp?: boolean;
}

class AssignMemberDto {
  @IsUUID()
  memberId!: string;
}

function actor(req: any): Actor {
  return { userId: req.appUser.id, memberId: req.membership.memberId, role: req.membership.role, ip: req.ip };
}

/** Boutiques et caisses (T-50) : gestion réservée au propriétaire et aux administrateurs. */
@ApiTags('Boutiques et caisses')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId')
@UseGuards(SessionGuard, RequireMemberGuard, RequireActionGuard)
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get('stores')
  @RequireAction('stores:manage')
  async list(@Param('merchantId') merchantId: string) {
    return { data: await this.stores.listStores(merchantId) };
  }

  @Post('stores')
  @RequireAction('stores:manage')
  create(@Param('merchantId') merchantId: string, @Body() dto: CreateStoreDto, @Req() req: any) {
    return this.stores.createStore(merchantId, dto, actor(req));
  }

  @Patch('stores/:storeId')
  @RequireAction('stores:manage')
  update(@Param('merchantId') merchantId: string, @Param('storeId', ParseUUIDPipe) storeId: string, @Body() dto: UpdateStoreDto, @Req() req: any) {
    return this.stores.updateStore(merchantId, storeId, dto, actor(req));
  }

  @Post('stores/:storeId/tills')
  @RequireAction('stores:manage')
  createTill(@Param('merchantId') merchantId: string, @Param('storeId', ParseUUIDPipe) storeId: string, @Body() dto: CreateTillDto, @Req() req: any) {
    return this.stores.createTill(merchantId, storeId, dto, actor(req));
  }

  @Patch('tills/:tillId')
  @RequireAction('stores:manage')
  updateTill(@Param('merchantId') merchantId: string, @Param('tillId', ParseUUIDPipe) tillId: string, @Body() dto: UpdateTillDto, @Req() req: any) {
    return this.stores.updateTill(merchantId, tillId, dto, actor(req));
  }

  @Post('tills/:tillId/members')
  @RequireAction('stores:manage')
  assign(@Param('merchantId') merchantId: string, @Param('tillId', ParseUUIDPipe) tillId: string, @Body() dto: AssignMemberDto, @Req() req: any) {
    return this.stores.assignMember(merchantId, tillId, dto.memberId, actor(req));
  }

  @Delete('tills/:tillId/members/:memberId')
  @RequireAction('stores:manage')
  unassign(
    @Param('merchantId') merchantId: string,
    @Param('tillId', ParseUUIDPipe) tillId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Req() req: any,
  ) {
    return this.stores.unassignMember(merchantId, tillId, memberId, actor(req));
  }

  @Get('tills/:tillId/qr.pdf')
  @RequireAction('stores:manage')
  @ApiProduces('application/pdf')
  async qr(
    @Param('merchantId') merchantId: string,
    @Param('tillId', ParseUUIDPipe) tillId: string,
    @Query('format') format: string | undefined,
    @Req() req: any,
    @Res() res: any,
  ) {
    const size = (format ?? 'A6').toUpperCase();
    if (size !== 'A5' && size !== 'A6') throw new ApiError(HttpStatus.BAD_REQUEST, 'validation_echouee', 'format : A5 ou A6', 'format');
    const { filename, pdf } = await this.stores.tillQrPdf(merchantId, tillId, size, actor(req));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' });
    res.send(pdf);
  }

  /** Caisses du membre connecté (caissier : les siennes ; gestionnaires : toutes). */
  @Get('tills/mine')
  async mine(@Param('merchantId') merchantId: string, @Req() req: any) {
    return { data: await this.stores.myTills(merchantId, actor(req)) };
  }
}
