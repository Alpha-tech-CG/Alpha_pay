/**
 * OpenTelemetry — initialisation tracing distribué (ALP-123).
 * Ce fichier DOIT être importé en tout premier dans main.ts,
 * avant NestJS et tout autre module, sinon les instrumentations
 * auto ne patchent pas les modules déjà chargés.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Threadpool libuv : argon2 (m=64Mo, p=4 par hash), génération PDF et I/O fichier
// s'exécutent sur ce pool (défaut = 4). Sous un pic d'auth wallet, 4 threads
// deviennent un goulot → latence. On relève le défaut (surchargable via l'env).
// Posé ici car tracing.ts est le tout premier module chargé, avant toute
// opération threadpool (libuv lit la valeur à la 1re utilisation du pool).
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = '16';
}

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

const sdk = new NodeSDK({
  serviceName: 'paybrain-api',
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'paybrain-api',
    [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  }),
  traceExporter: new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }),
  instrumentations: [
    getNodeAutoInstrumentations({
      // Désactivé : trop verbeux en dev, peu utile pour PayBrain.
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

// Flush propre à l'arrêt du process (SIGTERM depuis ECS, SIGINT en dev).
const shutdown = () => sdk.shutdown().finally(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
