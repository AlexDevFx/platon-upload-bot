import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import Agenda = require('agenda');
import { SheetsService } from '../sheets/sheets.service';
import { ConfigurationService } from '../config/configuration.service';
import { LoggerService } from 'nest-logger';
import { CompareType, FilterOptions } from '../sheets/filterOptions';
import * as util from 'util';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
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

    this.agenda = new Agenda({ db: { address: url, collection: 'accounting-jobs', options: options }, processEvery: '5 seconds' });
    logger.info('Agenda has been initialized.');
    this.defineJobs();
  }

  agenda: Agenda;
  private repeatNewRowJobPeriodSeconds: number = 5;

  private defineJobs() {
    this.agenda.define('addAccountingRecord', async (job, done) => {
      /*const accountingSheet = this.configService.accountingSheet;
      const newRecord = job.attrs.data as NewAccontingRecord;
      const rowForFillingIndex = await this.sheetsService.getNonEmptyRowIndex(accountingSheet);

      if (rowForFillingIndex < accountingSheet.startRow) {
        await this.agenda.now('sendMessageToLog', {
          message: 'Не найдена подходящая строка для заполнения',
        });
        await this.agenda.schedule('in 30 seconds', 'addAccountingRecord', newRecord);
        done();
        return;
      }

      const cellsRange = accountingSheet.getRange(accountingSheet.startColumnName, accountingSheet.endColumnName, rowForFillingIndex);
      let updateResult = await this.sheetsService.updateCellsValues(accountingSheet.spreadSheetId, cellsRange, [
        [
          newRecord.date,
          newRecord.sourceAccountName,
          newRecord.destinationAccountName,
          newRecord.amount,
          newRecord.comments,
          newRecord.projectName,
          newRecord.reason,
          newRecord.subType1,
          newRecord.subType2,
          newRecord.subType3,
          newRecord.screenshotUrl,
          newRecord.authorFullName,
          newRecord.authorLogin,
          newRecord.authorTelegramId,
        ],
      ],'USER_ENTERED');

      if (updateResult) {
        const filterOptions: FilterOptions = {
          range: accountingSheet,
          params: [
            { column: accountingSheet.projectNameColumn, type: CompareType.IsNotEmpty, value: newRecord.date },
          ],
        };
        const insertedRow = (await this.sheetsService.getSheetValues(accountingSheet.spreadSheetId, cellsRange))[0];

        updateResult = insertedRow !== undefined && insertedRow[accountingSheet.projectNameColumnIndex] === newRecord.projectName && insertedRow[accountingSheet.reasonColumnIndex] === newRecord.reason;
      }

      if (!updateResult) {
        await this.agenda.schedule(`in ${this.repeatNewRowJobPeriodSeconds} seconds`, 'addAccountingRecord', newRecord);
      }else{
        await this.agenda.now('accountingSendHtmlMessageToChat', {
          chatId: newRecord.fromChatId,
          message: 'Данные введены'
        });
      }*/
      done();
    });

    this.logger.info('Agenda jobs has been defined.');
  }

  async onModuleInit() {
    await this.agenda.start();
    this.logger.info('Agenda has been started');
    /*const newRecord: NewAccontingRecord = {
      date: '23.10.2020 14:10:32',
      sourceAccountName: 'Сема Точка',
      destinationAccountName: 'ООО Клевер Точка',
      amount: '321 540,56',
      comments: 'Тест бота',
      projectName: '',
      reason: '',
      subType1: '',
      subType2: '',
      subType3: '',
      screenshotUrl: '',
      authorFullName: '',
      authorLogin: '',
      authorTelegramId: 12321321,
    };
    await this.agenda.now('addAccountingRecord', newRecord);*/
  }

  async onModuleDestroy() {
    await this.agenda.stop();
  }
}
