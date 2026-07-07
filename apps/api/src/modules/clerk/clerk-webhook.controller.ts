import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ClerkWebhookGuard } from './clerk-webhook.guard';
import { ClerkWebhookService } from './clerk-webhook.service';

/**
 * Reçoit les événements Clerk (authentification dashboard marchands).
 * Sécurisé par signature Svix (CLERK_WEBHOOK_SECRET).
 *
 * Configurer dans la console Clerk :
 *   URL      → https://api.paybrain.cg/webhooks/clerk
 *   Événements → user.created
 */
@Controller('webhooks/clerk')
@UseGuards(ClerkWebhookGuard)
export class ClerkWebhookController {
  constructor(private readonly service: ClerkWebhookService) {}

  @Post()
  @HttpCode(200)
  async handle(@Req() req: any) {
    const event = req.clerkEvent as { type: string; data: unknown };
    if (event.type === 'user.created') {
      await this.service.handleUserCreated(event.data as any);
    }
    // Les autres types d'événements sont ACK 200 sans traitement.
    return { received: true };
  }
}
