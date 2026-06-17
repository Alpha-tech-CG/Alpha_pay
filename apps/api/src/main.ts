import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { loadSecretsFromAws } from './secrets/secrets-loader';
import { bodyGuard } from './common/security/body-guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { buildCorsOptions } from './common/security/cors';

const MAX_BODY_BYTES = 8 * 1024;

async function bootstrap() {
  await loadSecretsFromAws();

  // rawBody:true conserve le corps brut de la requête (req.rawBody) — indispensable
  // pour vérifier la signature HMAC des webhooks sur les octets exacts reçus (ALP-158).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // Derrière un unique LB/proxy (ALB/Cloudflare) : faire confiance au 1er hop
  // pour que req.ip reflète l'IP client réelle (allowlist webhooks, ALP-160).
  app.set('trust proxy', 1);

  // Borne le parser JSON à 8 KiB : un body plus gros → 413 automatique (ALP-153).
  app.useBodyParser('json', { limit: MAX_BODY_BYTES, strict: true });

  // Rejet précoce : Content-Type non-JSON → 415, Content-Length > 8 KiB → 413,
  // avant toute bufferisation/parsing (anti-DoS, ALP-153).
  app.use(bodyGuard({ maxBytes: MAX_BODY_BYTES }));

  // En-têtes de sécurité, dont HSTS avec preload (ALP-155).
  app.use(
    helmet({
      hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    }),
  );
  // CORS sur allowlist explicite (ALLOWED_ORIGINS), jamais '*' (ALP-155).
  app.enableCors(buildCorsOptions());
  app.useWebSocketAdapter(new WsAdapter(app));
  // forbidNonWhitelisted: tout champ inconnu fait échouer la requête en 400
  // (au lieu d'être silencieusement ignoré) — anti-injection (ALP-152).
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Masque les 5xx (jamais error.message brut au client) + request_id corrélable (ALP-154).
  app.useGlobalFilters(new AllExceptionsFilter());

  // Limite globale : protège l'API contre un flood générique.
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Trop de requêtes, réessayez plus tard.' },
    }),
  );

  // /payments est plus coûteux (déclenche un appel MTN/Airtel par requête) :
  // limite plus stricte pour empêcher l'abus ou l'épuisement de quota opérateur.
  app.use(
    '/payments',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Trop de paiements initiés, réessayez dans une minute.' },
    }),
  );

  // /webhooks reçoit du trafic serveur-à-serveur (MTN/Airtel) pouvant venir
  // d'IP partagées : limite plus large mais toujours bornée contre un flood.
  app.use(
    '/webhooks',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`PayBrain API (NestJS) démarrée sur le port ${port}`);
}

bootstrap();
