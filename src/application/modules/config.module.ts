import { Module } from '@nestjs/common';
import { ConfigurationService } from '../../core/config/configuration.service';

@Module({
  imports: [ConfigurationService],
  providers: [ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfigModule {}
