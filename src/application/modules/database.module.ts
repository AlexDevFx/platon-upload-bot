import { Module } from '@nestjs/common';
import { databaseProviders } from '../../core/dataStorage/database.providers';
import { ConfigModule } from '@nestjs/config';
import { ConfigurationService } from '../../core/config/configuration.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../config/.env.development', '../config/.env.production'],
    }),
  ],
  providers: [ConfigurationService, ...databaseProviders],
  exports: [...databaseProviders],
})
export class DatabaseModule {}
