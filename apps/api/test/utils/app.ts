import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../../src/app.module';

/**
 * Boote l'application réelle (AppModule complet) pour les tests e2e — c'est
 * volontairement le même point d'entrée que main.ts pour valider le vrai
 * graphe DI (cf. le bug UsersModule/@Global() de l'étape C, invisible aux
 * tests unitaires qui instancient les classes directement).
 *
 * Ne réplique QUE le ValidationPipe de main.ts (nécessaire pour que les DTOs
 * soient effectivement validés) — pas helmet/CORS/rate-limit/body-guard,
 * hors sujet pour la correction fonctionnelle de la feature testée.
 *
 * `configure` permet d'overrider des providers (ex. NotificationService pour
 * capter l'email d'invitation sans réseau) avant `.compile()`.
 */
export async function createTestApp(
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  // Requis : WalletModule déclare des @WebSocketGateway(). Sans adapter
  // explicite, Nest tente le driver socket.io par défaut (absent) et
  // `process.exit(1)` au lieu de lever une exception — même config que main.ts.
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}
