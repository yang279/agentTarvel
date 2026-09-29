import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  const port = parseInt(process.env.API_PORT ?? "3001", 10);
  await app.listen(port);
  console.log(`Travel API listening on http://localhost:${port}`);
}
bootstrap();