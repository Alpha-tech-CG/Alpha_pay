import { Body, Controller, NotFoundException, Param, Post } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { WebhooksService } from './webhooks.service';
import { WebhookPayload } from '@paybrain/shared';

function isValidSecret(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('mtn/:secret')
  handleMtn(@Param('secret') secret: string, @Body() payload: WebhookPayload) {
    if (!isValidSecret(secret, process.env.MTN_WEBHOOK_SECRET)) {
      throw new NotFoundException();
    }
    return this.webhooksService.handleWebhook('MTN', payload);
  }

  @Post('airtel/:secret')
  handleAirtel(@Param('secret') secret: string, @Body() payload: WebhookPayload) {
    if (!isValidSecret(secret, process.env.AIRTEL_WEBHOOK_SECRET)) {
      throw new NotFoundException();
    }
    return this.webhooksService.handleWebhook('AIRTEL', payload);
  }
}
