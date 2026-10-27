import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from '../../src/app.module';
import { validationExceptionFactory } from '../../src/common/errors/api-error';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { JobQueue } from '../../src/common/queue/job-queue';
import { InMemoryJobQueue } from '../../src/common/queue/in-memory-job-queue';
import { MessagingProviders } from '../../src/modules/messaging/messaging-providers';
import { MessagingService } from '../../src/modules/messaging/messaging.service';
import { TemplateService } from '../../src/modules/messaging/template.service';

export interface TestApp {
  app: INestApplication;
  queue: InMemoryJobQueue;
  providers: MessagingProviders;
  /** Exécute les envois en file et renvoie le dernier code à 6 chiffres reçu par `to`. */
  lastCode(to: string): Promise<string>;
  /** Recharge le catalogue de modèles (à appeler après chaque remise à zéro de la base). */
  syncTemplates(): Promise<void>;
}

/**
 * Boote l'application réelle (AppModule complet, même graphe d'injection que
 * main.ts) sur la base de test, avec les fournisseurs factices et une file en
 * mémoire pilotable. Reprend le ValidationPipe et le filtre d'erreurs de
 * main.ts ; pas helmet/CORS/limites de débit, hors sujet ici.
 */
export async function createTestApp(configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (configure) builder = configure(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication();
  // Requis : WebhooksModule déclare un @WebSocketGateway(). Sans adapter
  // explicite, Nest tente le driver socket.io par défaut (absent).
  app.useWebSocketAdapter(new WsAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationExceptionFactory }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  const queue = app.get(JobQueue) as InMemoryJobQueue;
  const providers = app.get(MessagingProviders);
  app.get(MessagingService).register();
  // En test, le catalogue n'est pas synchronisé au démarrage : on le fait ici (base vidée entre les tests).
  const templates = app.get(TemplateService);

  return {
    app,
    queue,
    providers,
    async syncTemplates() {
      await templates.syncCatalog();
    },
    async lastCode(to: string) {
      await queue.drain('messages');
      const message = [...providers.outbox.sent].reverse().find((m) => m.to === to);
      if (!message) throw new Error(`Aucun message envoyé à ${to}`);
      const code = message.variables?.[0] ?? /\b(\d{6})\b/.exec(message.content)?.[1];
      if (!code) throw new Error('Aucun code dans le message');
      return code;
    },
  };
}
