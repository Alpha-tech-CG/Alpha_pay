import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Spécification OpenAPI 3.1 de l'API publique (T-58). La description reprend le
 * guide développeur en français (`guide.md`) : le portail l'affiche en tête,
 * avec ses sections dans la navigation, puis la référence de chaque route.
 */
export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const guide = readFileSync(join(__dirname, 'guide.md'), 'utf8');
  const config = new DocumentBuilder()
    .setTitle('API AlphaPay')
    .setDescription(guide)
    .setVersion('1.0')
    .setOpenAPIVersion('3.1.0')
    .setContact('Support AlphaPay', 'https://alphapay.cg', 'support@alphapay.cg')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Clé API ap_test_… ou ap_live_…' }, 'ApiKey')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Session du tableau de bord' }, 'Bearer')
    .addTag('Paiements', 'Créer, lire et lister les paiements Mobile Money')
    .addTag('Liens de paiement', 'Liens à partager par WhatsApp ou SMS')
    .addTag('Messages et OTP', 'SMS, WhatsApp, email et codes à usage unique')
    .addTag('Webhooks', 'Endpoints de notification et journal des livraisons')
    .addTag('Clés API', 'Clés test et live')
    .addServer('https://api.alphapay.cg', 'Production')
    .addServer('http://localhost:3000', 'Local')
    .build();
  return SwaggerModule.createDocument(app, config);
}

const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com https://fonts.scalar.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Portail développeurs (T-58) : spécification sur `/docs/openapi.json`, et
 * page de documentation sur `/docs` rendue par `renderDocs` (Scalar, chargé
 * par main.ts : paquet ESM). Public : c'est la documentation des intégrateurs.
 */
export function mountDeveloperPortal(app: INestApplication, renderDocs?: (openapi: OpenAPIObject) => unknown): void {
  const openapi = buildOpenApi(app);
  app.use('/docs/openapi.json', (_req: any, res: any) => res.json(openapi));
  if (!renderDocs) return;
  // CSP propre au portail : Scalar s'amorce par un script en ligne et se charge
  // depuis jsDelivr. Le reste de l'API garde la CSP stricte de helmet.
  app.use('/docs', (_req: any, res: any, next: any) => {
    res.setHeader('Content-Security-Policy', DOCS_CSP);
    next();
  });
  app.use('/docs', renderDocs(openapi) as any);
}
