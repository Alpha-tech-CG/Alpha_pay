import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ScopesGuard } from '../../common/guards/scopes.guard';
import { RequiredScopes } from '../../common/decorators/scopes.decorator';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { CreateWebhookEndpointDto, UpdateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';

@ApiTags('Webhooks')
@ApiSecurity('ApiKey')
@Controller('v1/webhook-endpoints')
@UseGuards(ApiKeyGuard, ScopesGuard)
export class WebhooksOutController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @Get()
  @RequiredScopes('webhooks:read')
  list(@Req() req: any) {
    return this.endpoints.list(req.merchant.id);
  }

  @Post()
  @RequiredScopes('webhooks:write')
  create(@Body() dto: CreateWebhookEndpointDto, @Req() req: any) {
    return this.endpoints.create(req.merchant.id, dto);
  }

  @Patch(':id')
  @RequiredScopes('webhooks:write')
  update(@Param('id') id: string, @Body() dto: UpdateWebhookEndpointDto, @Req() req: any) {
    return this.endpoints.update(req.merchant.id, id, dto);
  }

  @Delete(':id')
  @RequiredScopes('webhooks:write')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.endpoints.remove(req.merchant.id, id);
  }

  @Get(':id/deliveries')
  @RequiredScopes('webhooks:read')
  deliveries(@Param('id') id: string, @Req() req: any) {
    return this.endpoints.deliveries(req.merchant.id, id);
  }

  @Post(':id/test')
  @RequiredScopes('webhooks:write')
  test(@Param('id') id: string, @Req() req: any) {
    return this.endpoints.test(req.merchant.id, id);
  }
}
