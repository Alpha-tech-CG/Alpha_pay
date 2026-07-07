import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { InternalGuard } from '../../common/guards/internal.guard';
import { OnboardingService } from './onboarding.service';

class RejectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

/**
 * Endpoints d'administration de l'onboarding marchand.
 * Protégés par InternalGuard (INTERNAL_API_TOKEN en en-tête X-Internal-Token).
 *
 * À exposer uniquement sur le réseau interne (pas via l'ALB public en prod).
 */
@Controller('internal/onboarding')
@UseGuards(InternalGuard)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}

  /** Liste les comptes en attente de validation. */
  @Get('pending')
  listPending() {
    return this.service.listPending();
  }

  /** Valide et active un compte. */
  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.service.approve(id);
  }

  /** Rejette un compte avec motif. */
  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.service.reject(id, dto.reason);
  }
}
