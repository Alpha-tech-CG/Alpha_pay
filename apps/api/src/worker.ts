import "./tracing";
import "reflect-metadata";
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return (this as unknown as bigint).toString();
};

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadSecrets } from "./secrets/secrets-loader";
import { PaymentStatusPoller } from "./modules/payment-status/payment-status.poller";
import { JsonNestLogger, logger } from "./common/logging/logger";
import { validateEnv } from "./config/env.validation";

/**
 * Process worker (D-008) : même code que l'API, sans serveur HTTP. Consomme
 * les files BullMQ ; l'API ne fait qu'y déposer des tâches.
 */
async function bootstrap() {
  await loadSecrets();
  validateEnv();
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL requis pour le worker");

  const app = await NestFactory.createApplicationContext(AppModule, { logger: new JsonNestLogger() });
  app.enableShutdownHooks();

  app.get(PaymentStatusPoller).register();

  logger.info({ queues: ["payment-status"] }, "Worker démarré");
}

bootstrap().catch((err) => {
  logger.fatal({ err: err instanceof Error ? { message: err.message, stack: err.stack } : String(err) }, "Échec du démarrage du worker");
  process.exit(1);
});
