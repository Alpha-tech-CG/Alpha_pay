import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  app.use(helmet());
  // Strict CORS — only the configured frontend origin, no wildcard.
  app.enableCors({ origin: config.get<string>('frontendUrl'), credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
  );

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  Logger.log(`AlphaPay backend listening on http://localhost:${port}`, 'Bootstrap');
}
void bootstrap();
