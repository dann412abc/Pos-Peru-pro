import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origins = (process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
  if (process.env.NODE_ENV === 'production') {
    app.enableCors({ origin: origins, credentials: true });
  } else {
    app.enableCors({ origin: true, credentials: true });
  }

  // Validacion global de DTOs (class-validator).
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  // Swagger / OpenAPI en /api/docs.
  const config = new DocumentBuilder()
    .setTitle('Mi Carrito POS API')
    .setDescription('Tu punto de venta, siempre contigo. Sistema de facturacion electronica POS para Peru (IGV 18%, PEN).')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Mi Carrito POS backend escuchando en http://localhost:${port}`);
  console.log(`Swagger en http://localhost:${port}/api/docs`);
}

bootstrap().catch((err) => {
  console.error('Error al iniciar la aplicacion:', err.message);
  process.exit(1);
});
