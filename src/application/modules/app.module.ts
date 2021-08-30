import { Module } from '@nestjs/common';
import { BotModule } from './bot.module';
import { LoggerModule } from './logger.module';

@Module({
  imports: [BotModule, LoggerModule],
})
export class AppModule {}
