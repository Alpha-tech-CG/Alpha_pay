import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { IncomingRequest, ProviderError, safeEqual } from '@paybrain/providers';
import { MessagingProviders } from './messaging-providers';
import { MessagingService } from './messaging.service';

function incoming(req: Request, body: unknown): IncomingRequest {
  const raw = (req as any).rawBody as Buffer | undefined;
  return { headers: req.headers, body, rawBody: raw ? raw.toString('utf8') : undefined };
}

/**
 * Accusés de livraison et messages entrants des fournisseurs (§M9).
 * Traitement idempotent : un accusé rejoué ne change rien.
 */
@ApiExcludeController()
@Controller('webhooks/messages')
export class MessagingWebhooksController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly providers: MessagingProviders,
  ) {}

  /** Infobip ne signe pas : l'URL d'accusé porte un jeton secret. */
  private assertToken(token: string | undefined) {
    const expected = process.env.MESSAGING_WEBHOOK_TOKEN;
    if (!expected || !token || !safeEqual(token, expected)) throw new ForbiddenException();
  }

  @Post('infobip')
  @HttpCode(200)
  async infobipReports(@Query('token') token: string, @Req() req: Request, @Body() body: unknown) {
    this.assertToken(token);
    const events = this.providers.sms.parseDeliveryReport?.(incoming(req, body)) ?? [];
    return { applied: await this.messaging.applyDeliveryEvents(this.providers.sms.name, events) };
  }

  @Post('infobip/inbound')
  @HttpCode(200)
  async infobipInbound(@Query('token') token: string, @Req() req: Request, @Body() body: unknown) {
    this.assertToken(token);
    const inbound = this.providers.sms.parseInbound?.(incoming(req, body)) ?? [];
    return { optOuts: await this.messaging.applyInbound('SMS', inbound) };
  }

  /** Vérification de l'abonnement au webhook par Meta. */
  @Get('whatsapp')
  verifyWhatsApp(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (mode !== 'subscribe' || !expected || !verifyToken || !safeEqual(verifyToken, expected)) {
      res.status(403).end();
      return;
    }
    res.status(200).type('text/plain').send(challenge);
  }

  @Post('whatsapp')
  @HttpCode(200)
  async whatsapp(@Req() req: Request, @Body() body: unknown) {
    const provider = this.providers.whatsapp;
    const request = incoming(req, body);
    try {
      const events = provider.parseStatusWebhook?.(request) ?? [];
      const inbound = provider.parseInbound?.(request) ?? [];
      return {
        applied: await this.messaging.applyDeliveryEvents(provider.name, events),
        optOuts: await this.messaging.applyInbound('WHATSAPP', inbound),
      };
    } catch (err) {
      if (err instanceof ProviderError && err.code === 'invalid_signature') throw new ForbiddenException();
      throw err;
    }
  }

  /** Accusés factices (développement et tests de bout en bout seulement). */
  @Post('mock')
  @HttpCode(200)
  async mock(@Body() body: { provider?: string; events?: unknown[] }) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();
    const provider = this.providers.byName(body.provider ?? '');
    const parse = provider && 'parseDeliveryReport' in provider ? provider.parseDeliveryReport : undefined;
    if (!provider || !parse) throw new NotFoundException();
    const events = parse.call(provider, { headers: {}, body: body.events ?? [] });
    return { applied: await this.messaging.applyDeliveryEvents(provider.name, events) };
  }
}
