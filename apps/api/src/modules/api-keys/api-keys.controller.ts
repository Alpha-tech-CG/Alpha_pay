import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('v1/api-keys')
@UseGuards(ApiKeyGuard)
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@Req() req: any) {
    return this.apiKeys.list(req.merchant.id);
  }

  @Post()
  create(@Body() dto: CreateApiKeyDto, @Req() req: any) {
    return this.apiKeys.create(req.merchant.id, dto);
  }

  @Post(':id/rotate')
  rotate(@Param('id') id: string, @Req() req: any) {
    return this.apiKeys.rotate(req.merchant.id, id);
  }

  @Delete(':id')
  revoke(@Param('id') id: string, @Req() req: any) {
    return this.apiKeys.revoke(req.merchant.id, id);
  }
}
