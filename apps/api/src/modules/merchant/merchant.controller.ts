import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { MerchantService } from './merchant.service';

@ApiTags('Marchand')
@ApiSecurity('ApiKey')
@Controller('v1/merchant')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class MerchantController {
  constructor(private readonly merchant: MerchantService) {}

  @Get('profile')
  @RequiredScopes('merchant:read')
  profile(@Req() req: any) {
    return this.merchant.profile(req.merchant.id);
  }
}
