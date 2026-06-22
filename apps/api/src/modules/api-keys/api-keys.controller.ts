import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('Clés API')
@ApiSecurity('ApiKey')
@Controller('v1/api-keys')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  @RequiredScopes('apikeys:read')
  list(@Req() req: any) {
    return this.apiKeys.list(req.merchant.id);
  }

  @Post()
  @RequiredScopes('apikeys:write')
  create(@Body() dto: CreateApiKeyDto, @Req() req: any) {
    return this.apiKeys.create(req.merchant.id, dto);
  }

  @Post(':id/rotate')
  @RequiredScopes('apikeys:write')
  rotate(@Param('id') id: string, @Req() req: any) {
    return this.apiKeys.rotate(req.merchant.id, id);
  }

  @Delete(':id')
  @RequiredScopes('apikeys:write')
  revoke(@Param('id') id: string, @Req() req: any) {
    return this.apiKeys.revoke(req.merchant.id, id);
  }
}
