import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ClerkSessionGuard } from './auth/clerk-session.guard';
import { RequireMemberGuard } from './auth/require-member.guard';
import { RequireActionGuard } from './auth/require-action.guard';
import { RequireAction } from './auth/require-action.decorator';
import { actorFromRequest } from './auth/actor';
import { OwnershipService } from './services/ownership.service';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';

@ApiTags('Équipe marchand — propriété')
@ApiSecurity('Bearer')
@Controller('v1/merchants/:merchantId/ownership')
@UseGuards(ClerkSessionGuard, RequireMemberGuard, RequireActionGuard)
export class OwnershipController {
  constructor(private readonly ownership: OwnershipService) {}

  @Post('transfer')
  @RequireAction('ownership:transfer')
  transfer(@Param('merchantId') merchantId: string, @Body() dto: TransferOwnershipDto, @Req() req: any) {
    return this.ownership.transfer(merchantId, dto.toUserId, actorFromRequest(req));
  }
}
