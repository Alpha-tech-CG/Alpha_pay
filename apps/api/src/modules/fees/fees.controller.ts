import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { InternalGuard } from '../../common/guards/internal.guard';
import { FeesService } from './fees.service';
import { AssignFeeProfileDto, CreateFeeProfileDto, CreateFeeRuleDto, SimulateFeeDto } from './dto/fees.dto';

@Controller('internal/fee-profiles')
@UseGuards(InternalGuard)
export class FeesController {
  constructor(private readonly fees: FeesService) {}

  @Get()
  list() {
    return this.fees.listProfiles();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.fees.getProfile(id);
  }

  @Post()
  create(@Body() dto: CreateFeeProfileDto) {
    return this.fees.createProfile(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.fees.deleteProfile(id);
  }

  @Post(':id/rules')
  addRule(@Param('id') id: string, @Body() dto: CreateFeeRuleDto) {
    return this.fees.addRule(id, dto);
  }

  @Delete(':id/rules/:ruleId')
  removeRule(@Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.fees.removeRule(id, ruleId);
  }

  // Affecte (ou retire) un profil de frais à un marchand.
  @Put('assign')
  assign(@Body() dto: AssignFeeProfileDto) {
    return this.fees.assignToMerchant(dto.merchantId, dto.feeProfileId ?? null);
  }

  // Simulateur de frais pour une transaction type.
  @Post('simulate')
  simulate(@Body() dto: SimulateFeeDto) {
    return this.fees.simulate(dto);
  }
}
