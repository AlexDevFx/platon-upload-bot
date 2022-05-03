import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SheetsService } from '../sheets/sheets.service';
import { ConfigurationService } from '../config/configuration.service';
import { LoggerService } from 'nest-logger';
import * as util from 'util';
import { Agenda } from 'agenda';
import { Telegraf } from 'telegraf';
import { TelegrafContext } from 'telegraf/typings/context';
import { IUploadMaintenanceParams } from './iupload-maintenance.params';
import { RequestedFile } from '../filesUploading/userUploadingInfoDto';

export interface MessageData {
  chatId: number;
  message: string;
}

interface IStartUploadingParams {
  files: RequestedFile[];
  sessionId: string;
  maintenanceId: string;
  fromChatId: number;
  engineerPersonId: string;
  sskNumber: string;
  maintenanceDate: string;
}

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private bot: Telegraf<TelegrafContext>;

  constructor(
    private readonly sheetsService: SheetsService,
    private readonly configService: ConfigurationService,
    private readonly logger: LoggerService,
  ) {
    const jobsDbConfig = configService.appconfig.jobs.db;
    const url = util.format(
      'mongodb://%s:%s@%s',
      jobsDbConfig.username,
      jobsDbConfig.password,
      [`${jobsDbConfig.host}:${jobsDbConfig.port}`].join(','),
    );
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      tls: jobsDbConfig.tls,
      replicaSet: jobsDbConfig.replicaSet,
      tlsCAFile: jobsDbConfig.tlsCAFile,
    };

    this.agenda = new Agenda({
      db: { address: url, collection: configService.appconfig.jobs.uploadJobsCollection, options: options },
      processEvery: '5 seconds',
    });
    logger.info('Agenda has been initialized.');
  }

  agenda: Agenda;
  private repeatNewRowJobPeriodSeconds: number = 5;

  public init(bot: Telegraf<TelegrafContext>): void {
    this.bot = bot;
    this.defineJobs();
  }

  public async runUploadQuadMaintenanceFiles(params: IUploadMaintenanceParams): Promise<boolean> {
    return (await this.agenda.now('uploadQuadMaintenanceFiles', params)) !== undefined;
  }

  public async startUploadingFiles(params: IStartUploadingParams): Promise<boolean> {
    return (await this.agenda.now('startUploadingFiles', params)) !== undefined;
  }

  public async startQuadUploadingFiles(params: IStartUploadingParams): Promise<boolean> {
    return (await this.agenda.now('startQuadUploadingFiles', params)) !== undefined;
  }

  public async startYearUploadingFiles(params: IStartUploadingParams): Promise<boolean> {
    return (await this.agenda.now('startYearUploadingFiles', params)) !== undefined;
  }

  private defineJobs() {
    this.agenda.define('uploadBotSendHtmlMessageToChat', async (job, done) => {
      const messageData = job.attrs.data as MessageData;
      await this.bot.telegram.sendMessage(messageData.chatId, messageData.message, { parse_mode: 'HTML' });
      done();
    });

    this.agenda.define('sendNotFoundFilesToBot', async (job, done) => {
      const messageData = job.attrs.data as IStartUploadingParams;
      if (messageData.fromChatId && messageData.files?.length > 0) {
        let message = `Список файлов, которые не удалось загрузить для ТО <b>${messageData.maintenanceId}</b> ССК-<b>${messageData.sskNumber}</b>`;
        for (const file of messageData.files) {
          message += `<b>${file.equipmentName}</b>(${file.index}), id: ${file.equipmentId}, url: ${file.file.fileId}\n`;
        }
        await this.bot.telegram.sendMessage(messageData.fromChatId, message, { parse_mode: 'HTML' });
      }
      done();
    });

    this.logger.info('Agenda jobs has been defined.');
  }

  async onModuleInit() {
    await this.agenda.start();
    this.logger.info('Agenda has been started');
  }

  async onModuleDestroy() {
    await this.agenda.stop();
  }
}
