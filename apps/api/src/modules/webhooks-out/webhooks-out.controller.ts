import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { WebhookEndpointsService } from './webhook-endpoints.service';
import { CreateWebhookEndpointDto, UpdateWebhookEndpointDto } from './dto/create-webhook-endpoint.dto';

@Controller('v1/webhook-endpoints')
@UseGuards(ApiKeyGuard)
export class WebhooksOutController {
  constructor(private readonly endpoints: WebhookEndpointsService) {}

  @Get()
  list(@Req() req: any) {
    return this.endpoints.list(req.merchant.id);
  }

  @Post()
  create(@Body() dto: CreateWebhookEndpointDto, @Req() req: any) {
    return this.endpoints.create(req.merchant.id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWebhookEndpointDto, @Req() req: any) {
    return this.endpoints.update(req.merchant.id, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.endpoints.remove(req.merchant.id, id);
  }

  @Get(':id/deliveries')
  deliveries(@Param('id') id: string, @Req() req: any) {
    return this.endpoints.deliveries(req.merchant.id, id);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Req() req: any) {
    return this.endpoints.test(req.merchant.id, id);
  }
}
