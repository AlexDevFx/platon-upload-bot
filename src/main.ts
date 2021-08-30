import { NestFactory } from '@nestjs/core';
import { AppModule } from './application/modules/app.module';
import { BotModule } from './application/modules/bot.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.select(BotModule);
  await app.listen(3000);
}
bootstrap();
