/**
 * Exporte la spécification OpenAPI 3.1 dans docs/api/openapi.json sans base ni
 * Redis : Nest en mode « preview » résout les routes sans instancier les services.
 *   pnpm --filter @paybrain/api openapi
 */
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { AppModule } from '../src/app.module';
import { buildOpenApi } from '../src/openapi/openapi';

async function main() {
  const app = await NestFactory.create(AppModule, { preview: true, logger: false, abortOnError: false });
  const doc = buildOpenApi(app);
  const out = resolve(__dirname, '../../../docs/api/openapi.json');
  writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  console.log(`OpenAPI ${doc.openapi} : ${Object.keys(doc.paths).length} routes → ${out}`);
  await app.close();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
