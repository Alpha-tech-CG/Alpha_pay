import "./tracing";   // OTel doit être le tout premier import — ALP-123
import "reflect-metadata";
import * as Sentry from "@sentry/node";

// Initialisation Sentry avant tout autre code (ALP-123).
// SENTRY_DSN vide/absent → Sentry reste silencieux (pas d'erreur).
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

// Sérialisation JSON des BigInt (montants en centimes, séquences ledger) — ALP-168.
// Les clients doivent parser ces champs comme chaînes décimales.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return (this as unknown as bigint).toString();
};
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { AppModule } from "./app.module";
import { WsAdapter } from "@nestjs/platform-ws";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { apiReference } from "@scalar/nestjs-api-reference";
import { loadSecrets } from "./secrets/secrets-loader";
import { bodyGuard } from "./common/security/body-guard";
import { createRateLimitStore } from "./common/security/redis-rate-limit.store";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { buildCorsOptions } from "./common/security/cors";
import { JsonNestLogger } from "./common/logging/logger";
import { requestLogger } from "./common/logging/request-logger.middleware";
import { validationExceptionFactory } from "./common/errors/api-error";
import { validateEnv } from "./config/env.validation";

const MAX_BODY_BYTES = 8 * 1024;

async function bootstrap() {
  await loadSecrets();
  // Refus de démarrer avec une configuration incomplète (T-14).
  validateEnv();

  // rawBody:true conserve le corps brut de la requête (req.rawBody) — indispensable
  // pour vérifier la signature HMAC des webhooks sur les octets exacts reçus (ALP-158).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: new JsonNestLogger(),
  });

  // Derrière un unique LB/proxy (ALB/Cloudflare) : faire confiance au 1er hop
  // pour que req.ip reflète l'IP client réelle (allowlist webhooks, ALP-160).
  app.set("trust proxy", 1);

  // request_id propagé + ligne d'accès JSON, avant tout autre middleware (§8.4).
  app.use(requestLogger());

  // Borne le parser JSON à 8 KiB : un body plus gros → 413 automatique (ALP-153).
  app.useBodyParser("json", { limit: MAX_BODY_BYTES, strict: true });
  app.useBodyParser("urlencoded", { limit: MAX_BODY_BYTES, extended: false });

  // Rejet précoce : Content-Type non-JSON → 415, Content-Length > 8 KiB → 413,
  // avant toute bufferisation/parsing (anti-DoS, ALP-153).
  app.use(
    bodyGuard({
      maxBytes: MAX_BODY_BYTES,
      formUrlencodedPaths: ["/webhooks/notifications/africastalking"],
    }),
  );

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
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Erreur au format §7 : { error: { code: "validation_echouee", message, param } }.
      exceptionFactory: validationExceptionFactory,
    }),
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
      store: createRateLimitStore("global"),
      message: { error: { code: 'trop_de_requetes', message: "Trop de requêtes, réessayez plus tard." } },
    }),
  );

  // POST /v1/payments est plus coûteux (déclenche un appel MTN/Airtel par requête) :
  // limite plus stricte pour empêcher l'abus ou l'épuisement de quota opérateur.
  const paymentsLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: createRateLimitStore("payments"),
    message: {
      error: { code: "trop_de_requetes", message: "Trop de paiements initiés, réessayez dans une minute." },
    },
  });
  app.use("/v1/payments", (req: any, res: any, next: any) =>
    req.method === "POST" ? paymentsLimiter(req, res, next) : next(),
  );

  // /webhooks reçoit du trafic serveur-à-serveur (MTN/Airtel) pouvant venir
  // d'IP partagées : limite plus large mais toujours bornée contre un flood.
  app.use(
    "/webhooks",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      store: createRateLimitStore("webhooks"),
    }),
  );

  // Création d'invitations équipe : limite stricte (anti-spam/anti-énumération
  // de l'index partiel « 1 invitation pending »), ALP-team étape F. `skip`
  // laisse passer GET/DELETE sur ce même chemin (list/revoke), non concernés.
  app.use(
    "/v1/merchants/:merchantId/members/invitations",
    rateLimit({
      windowMs: 60 * 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => req.method !== "POST",
      store: createRateLimitStore("invitations"),
      message: { error: { code: 'trop_de_requetes', message: "Trop d'invitations envoyées, réessayez plus tard." } },
    }),
  );

  // /v1/auth : inscription, connexion, codes, réinitialisation — limite par IP
  // (en plus des limites propres aux OTP et aux échecs de connexion).
  app.use(
    '/v1/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      store: createRateLimitStore('auth'),
      message: { error: { code: 'trop_de_requetes', message: 'Trop de tentatives, réessayez dans quelques minutes.' } },
    }),
  );

  // Documentation OpenAPI + playground interactif (ALP-138).
  // Désactivée en production par défaut (réduit la divulgation de la surface
  // d'API) ; réactivable explicitement via ENABLE_API_DOCS=true.
  const docsEnabled =
    process.env.NODE_ENV !== "production" || process.env.ENABLE_API_DOCS === "true";
  if (docsEnabled) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle("PayBrain API")
    .setDescription(
      "API d'agrégation de paiement mobile money (MTN, Airtel) — Congo",
    )
    .setVersion("1.0")
    .setOpenAPIVersion("3.1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", description: "Clé API ap_test_… ou ap_live_…" }, "ApiKey")
    .addBearerAuth({ type: "http", scheme: "bearer" }, "Bearer")
    .addTag("Paiements", "Initier et suivre les paiements mobile money")
    .addTag(
      "Liens de paiement",
      "Générer des liens de paiement hébergés (checkout)",
    )
    .addTag(
      "Clés API",
      "Gérer les clés API marchand (test/live, rotation, révocation)",
    )
    .addTag("Webhooks", "Configurer les endpoints de notification sortants")
    .addServer("http://localhost:3000", "Local")
    .addServer("https://api.paybrain.cg", "Production")
    .build();
  const openapi = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, openapi, {
    jsonDocumentUrl: "docs/openapi.json",
  });

  // Portail développeur Scalar (ALP-138) — rendu moderne sur /reference,
  // basé sur la même spec OpenAPI.
  app.use("/reference", apiReference({ content: openapi, theme: "purple" }));
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`PayBrain API (NestJS) démarrée sur le port ${port}`);
  console.log(`Documentation API : http://localhost:${port}/docs`);
}

bootstrap();
