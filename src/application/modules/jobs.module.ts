// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Module } from '@nestjs/common';
import { LoggerModule } from './logger.module';
import { JobsService } from '../../core/jobs/jobs.service';
import { SheetsService } from '../../core/sheets/sheets.service';
import { ConfigurationService } from '../../core/config/configuration.service';

@Module({
  imports: [LoggerModule],
  providers: [JobsService, SheetsService, ConfigurationService],
  exports: [JobsService, SheetsService, ConfigurationService],
})
export class JobsModule {}
