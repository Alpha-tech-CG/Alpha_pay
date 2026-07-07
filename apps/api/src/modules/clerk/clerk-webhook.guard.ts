import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Webhook } from 'svix';

/**
 * Vérifie la signature Svix des webhooks Clerk entrants.
 *
 * Clerk signe chaque payload avec un secret Svix (CLERK_WEBHOOK_SECRET).
 * La bibliothèque svix vérifie les en-têtes svix-id, svix-timestamp et
 * svix-signature sur le rawBody exact reçu, et rejette les replays > 5 min.
 */
@Injectable()
export class ClerkWebhookGuard implements CanActivate {
  private readonly logger = new Logger(ClerkWebhookGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!secret) {
      this.logger.error('CLERK_WEBHOOK_SECRET non configuré — webhook rejeté');
      throw new UnauthorizedException();
    }

    const rawBody: Buffer | undefined = request.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      this.logger.error('rawBody indisponible');
      throw new UnauthorizedException();
    }

    const headers = {
      'svix-id': request.headers['svix-id'],
      'svix-timestamp': request.headers['svix-timestamp'],
      'svix-signature': request.headers['svix-signature'],
    };

    if (!headers['svix-id'] || !headers['svix-timestamp'] || !headers['svix-signature']) {
      throw new UnauthorizedException('En-têtes Svix manquants');
    }

    try {
      const wh = new Webhook(secret);
      const payload = wh.verify(rawBody, headers as Record<string, string>);
      // Attache le payload vérifié sur la requête pour éviter un second parse.
      request.clerkEvent = payload;
      return true;
    } catch (err) {
      this.logger.warn(`Signature Clerk invalide : ${(err as Error).message}`);
      throw new UnauthorizedException('Signature Clerk invalide');
    }
  }
}
