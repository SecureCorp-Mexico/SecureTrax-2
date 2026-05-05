import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const log = new Logger('bootstrap');

  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('SecureTrax-2')
    .setDescription('Configurable Maps Hub — public API')
    .setVersion('v1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  log.log(`SecureTrax-2 API listening on :${port}`);
  log.log(`OpenAPI docs at http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal during bootstrap', err);
  process.exit(1);
});
