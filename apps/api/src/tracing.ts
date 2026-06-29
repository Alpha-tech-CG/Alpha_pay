/**
 * OpenTelemetry — initialisation tracing distribué (ALP-123).
 * Ce fichier DOIT être importé en tout premier dans main.ts,
 * avant NestJS et tout autre module, sinon les instrumentations
 * auto ne patchent pas les modules déjà chargés.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
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

// Flush propre à l'arrêt du process (SIGTERM depuis ECS).
process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
