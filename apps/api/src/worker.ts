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

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadSecrets } from "./secrets/secrets-loader";
import { PaymentStatusPoller } from "./modules/payment-status/payment-status.poller";

/**
 * Process worker (D-008) : même code que l'API, sans serveur HTTP. Consomme
 * les files BullMQ ; l'API ne fait qu'y déposer des tâches.
 */
async function bootstrap() {
  await loadSecrets();
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL requis pour le worker");

  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  app.get(PaymentStatusPoller).register();

  new Logger("Worker").log("Worker démarré : files payment-status");
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
