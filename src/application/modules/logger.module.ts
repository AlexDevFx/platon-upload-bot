import { Module } from '@nestjs/common';
import { ConfigModule } from './config.module';
import { LoggerService, LoggerOptions, LoggerTransport } from 'nest-logger';
import { ConfigurationService } from '../../core/config/configuration.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LoggerService,
      useFactory: (config: ConfigurationService) => {
        const options: LoggerOptions = {
          fileOptions: {
            filename: `${config.logger.filePrefix}-%DATE%.log`,
          },
          colorize: true,
        };
        const loggers = LoggerService.getLoggers([LoggerTransport.CONSOLE, LoggerTransport.ROTATE], options);
        return new LoggerService('info', loggers);
      },
      inject: [ConfigurationService],
    },
  ],
  exports: [LoggerService],
})
export class LoggerModule {}
