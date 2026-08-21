import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { PartnerStatus, PartnerType } from '@paybrain/database';
import { InternalGuard } from '../../common/guards/internal.guard';
import { PartnersService } from './partners.service';
import { CreatePartnerDto, UpdatePartnerDto, UpsertCredentialDto } from './dto/partner.dto';

// Back-office ops/admin — protégé par le jeton interne, jamais exposé publiquement.
@Controller('internal/partners')
@UseGuards(InternalGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  list(@Query('type') type?: PartnerType, @Query('status') status?: PartnerStatus) {
    return this.partners.list(type, status);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.partners.get(id);
  }

  @Post()
  create(@Body() dto: CreatePartnerDto) {
    return this.partners.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partners.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.partners.remove(id);
  }

  @Put(':id/credentials')
  setCredential(@Param('id') id: string, @Body() dto: UpsertCredentialDto) {
    return this.partners.setCredential(id, dto);
  }

  @Delete(':id/credentials/:credentialId')
  removeCredential(@Param('id') id: string, @Param('credentialId') credentialId: string) {
    return this.partners.removeCredential(id, credentialId);
  }

  @Get(':id/health')
  health(@Param('id') id: string, @Query('environment') environment?: string) {
    return this.partners.health(id, environment);
  }
}
