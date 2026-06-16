import { Body, Controller, Post } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookPayload } from '@paybrain/shared';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('mtn')
  handleMtn(@Body() payload: WebhookPayload) {
    return this.webhooksService.handleMtnWebhook(payload);
  }
}
