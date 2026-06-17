import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { WsAdapter } from '@nestjs/platform-ws';
import { loadSecretsFromAws } from './secrets/secrets-loader';

async function bootstrap() {
  await loadSecretsFromAws();

  // rawBody:true conserve le corps brut de la requête (req.rawBody) — indispensable
  // pour vérifier la signature HMAC des webhooks sur les octets exacts reçus (ALP-158).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());
  app.enableCors({ origin: '*', allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

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
