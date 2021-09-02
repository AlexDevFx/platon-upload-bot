import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseScene, Markup, Stage } from 'telegraf';
import { SceneContextMessageUpdate } from 'telegraf/typings/stage';
import * as fs from 'fs';
import { LoggerService } from 'nest-logger';
import { FileStorageService, IUploadResult } from '../../../core/sheets/filesStorage/file-storage.service';
import { SheetsService } from '../../../core/sheets/sheets.service';
import { ConfigurationService } from '../../../core/config/configuration.service';
import { RequestFile, UploadedFile, UploadingFilesInfo } from '../../../core/sheets/filesUploading/uploadingFilesInfo';
import { CallbackButton } from 'telegraf/typings/markup';
import { ColumnParam, CompareType, FilterOptions } from '../../../core/sheets/filterOptions';
import { UploadedEquipmentStore, UploadingType } from '../../../core/sheets/config/uploadedEquipmentStore';
import { v4 as uuidv4 } from 'uuid';
import { DbStorageService } from '../../../core/dataStorage/dbStorage.service';
import { JobsService } from '../../../core/jobs/jobs.service';
import { RequestedFile, RequestStatus } from '../../../core/dataStorage/filesUploading/userUploadingInfoDto';
import moment = require('moment');
import {IPerson, PersonsStore} from "../../../core/sheets/config/personsStore";
import {SskEquipmentStore} from "../../../core/sheets/config/sskEquipmentStore";

const { leave } = Stage;

enum UploadFilesSteps {
  Cancelled = -1,
  Enter,
  Uploading,
  UploadingConfirmed,
  Completed,
}

interface UploadFilesSceneState {
  user: {
    telegramId: bigint;
    person: IPerson,
  };
  sessionId: string;
  uploadingInfo: UploadingFilesInfo;
  step: UploadFilesSteps;
  maintenanceId: number;
  requestsToSend: RequestFile[];
}

class FileRequestData {
  public id: string;
  public file: UploadedFile;

  constructor(id: string, file: UploadedFile) {
    this.id = id;
    this.file = file;
  }
}

interface ISheetUploadRecord {
  maintenanceId: string;
  equipmentName: string;
  engineerPersonId: string;
  confirmatorPersonId: string;
  files: string[];
}

@Injectable()
export class UploadFilesSceneBuilder {
  readonly SceneName: string = 'upload-files';

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
    private readonly fileStorageService: FileStorageService,
    private readonly sheetsService: SheetsService,
    private readonly configurationService: ConfigurationService,
    private readonly uploadedEquipmentStore: UploadedEquipmentStore,
    private readonly dbStorageService: DbStorageService,
    private readonly jobsService: JobsService,
    private readonly personsStore: PersonsStore,
    private readonly sskEquipmentStore: SskEquipmentStore
  ) {}

  private async downloadImage(fileUrl: string, filePathToSave: string): Promise<void> {
    const writer = fs.createWriteStream(filePathToSave);
    const response = await this.httpService.get(fileUrl, { responseType: 'stream' }).toPromise();

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  private getQuarter(): number {
    const month = moment().month();
    return month % 3 === 0 ? month / 3 : Math.floor(month / 3) + 1;
  }

  private async uploadFile(file: UploadedFile, ctx: SceneContextMessageUpdate): Promise<string> {
    const stepState = ctx.scene.state as UploadFilesSceneState;

    if (!file) {
      await ctx.reply('Нет загруженного файла');
      return undefined;
    }

    const result = await this.createAndShareFolder(stepState.uploadingInfo.sskNumber, ctx);
    await this.downloadImage(file.url, file.name);
    const uploadResult = await this.fileStorageService.upload(file.name, file.size, result.fileId, null);

    if (!stepState.uploadingInfo.folderUrl) {
      stepState.uploadingInfo.folderUrl = result.fileUrl;
    }

    return uploadResult.fileUrl;
  }

  private async sendFileForUploading(requestId: string, file: UploadedFile, ctx: SceneContextMessageUpdate): Promise<boolean> {
    const stepState = ctx.scene.state as UploadFilesSceneState;

    if (!file) {
      await ctx.reply('Нет загруженного файла');
      return false;
    }
    const request = stepState.uploadingInfo.requests.find(e => e.id === requestId);
    if (request) {
      const uploadingInfo = await this.dbStorageService.findBy(stepState.sessionId);
      const requestedFile = new RequestedFile(requestId, request.equipmentId, request.equipmentName, {
        name: file.name,
        size: file.size,
        url: file.url,
      });
      if (uploadingInfo) {
        uploadingInfo.files.push(requestedFile);
        return await this.dbStorageService.update(uploadingInfo);
      }
    }

    return false;
  }

  private async cancelCommand(ctx: SceneContextMessageUpdate): Promise<void> {
    const stepState = ctx.scene.state as UploadFilesSceneState;
    stepState.step = UploadFilesSteps.Cancelled;
    await ctx.scene.leave();
  }

  private async createAndShareFolder(sskNumber: string, ctx: SceneContextMessageUpdate): Promise<IUploadResult> {
    const quarterFolderName = `${moment().format('YYYY')}.${this.getQuarter()}`;
    let result = await this.fileStorageService.getOrCreateFolder(quarterFolderName, null, null);
    if (!result.success) {
      await ctx.reply(`Не удалось создать папку ${quarterFolderName}`);
    }

    result = await this.fileStorageService.getOrCreateFolder('Фото ТО', result.fileId, null);
    if (!result.success) {
      await ctx.reply('Не удалось создать папку Фото ТО');
    }

    result = await this.fileStorageService.getOrCreateFolder(sskNumber, result.fileId, null);

    if (!result.success) {
      await ctx.reply(`Не удалось создать папку ${sskNumber}`);
    }

    result = await this.fileStorageService.shareFolderForReading(result.fileId);
    if (!result.success) {
      await ctx.reply(`Не удалось получить доступ к папке ${sskNumber}`);
    }

    return result;
  }

  private static buttonsFromArray(data: string[], action: string, initButton: CallbackButton): CallbackButton[][] {
    if (data === undefined || data.length < 1) return undefined;

    const buttons: CallbackButton[][] = [];
    let rowIndex = 0;
    buttons.push([]);

    if (initButton !== undefined) {
      buttons[rowIndex].push(initButton);
    }

    for (const d of data) {
      if (buttons[rowIndex].length > 2) {
        buttons.push([]);
        rowIndex++;
      }
      buttons[rowIndex].push(Markup.callbackButton(`${d}`, `${action}:${d}`));
    }

    return buttons;
  }

  private async createRequestsForFiles(ctx: SceneContextMessageUpdate): Promise<void> {
    const equipmentForUploading = await this.uploadedEquipmentStore.getData();

    if (!equipmentForUploading) return;
    const stepState = ctx.scene.state as UploadFilesSceneState;

    stepState.sessionId = await this.dbStorageService.insert({
      username: ctx.from.username,
      userId: ctx.from.id,
      files: [],
    });

    const columnParams: ColumnParam[] = [];
    const equipmentSheet = this.configurationService.equipmentSheet;

    columnParams.push({
      column: equipmentSheet.sskNumberColumn,
      type: CompareType.Equal,
      value: stepState.uploadingInfo.sskNumber,
    });
    const filterOptions: FilterOptions = {
      params: columnParams,
      range: equipmentSheet,
    };

    const sskEquipments = (await this.sskEquipmentStore.getData()).filter(e => e.sskNumber === stepState.uploadingInfo.sskNumber);
   
    const addedEquipments = [];
    stepState.uploadingInfo.requests = [];
    stepState.uploadingInfo.currentRequestIndex = 0;
    stepState.requestsToSend = [];
    let n = 0;
    for (let eq of equipmentForUploading) {
      if (n > 1) break;
      if (eq.type === UploadingType.Undefined) continue;

      n++;

      let message = `<b>${eq.name}</b>\n`;
      let additionalInfo = '';
      let equipmentId = eq.name;
      if (eq.type === UploadingType.Ssk) {
        const sskEquipment = sskEquipments.filter(e => e.name === eq.name && !addedEquipments.some(ae => ae === e.id))[0];
        if (sskEquipment) {
          addedEquipments.push(sskEquipment.id);
          const info = [];
          for (let ai of sskEquipment.additionalInfo) {
            if (ai.value && ai.value !== '') {
              info.push(`${ai.name} <b>${ai.value}</b>`);
            }
          }
          additionalInfo = info.join(',');
          if (additionalInfo !== '') additionalInfo += '\n';
          equipmentId = sskEquipment.id;
        }
      }
      for (let exml of eq.examples) {
        const requestFile = new RequestFile(
          uuidv4()
            .replace('-', '')
            .substr(0, 8),
          equipmentId,
          eq.name,
          `${message}${additionalInfo}${exml.description}`,
        );
        stepState.uploadingInfo.requests.push(requestFile);
        stepState.requestsToSend.push(requestFile);
      }
    }
  }

  private async startRequestFilesForEquipment(ctx: SceneContextMessageUpdate): Promise<void> {
    await this.createRequestsForFiles(ctx);
    await this.sendNextRequest(ctx);
    /*const stepState = ctx.scene.state as UploadFilesSceneState;
    
    if (!stepState.uploadingInfo || !stepState.uploadingInfo.requests) return;

    for(const request of stepState.uploadingInfo.requests){
      await ctx.reply(
          request.message,
          Markup.inlineKeyboard([
            Markup.callbackButton('✅ Принято', 'confUpl:' + stepState.sessionId + ':' + request.id),
            Markup.callbackButton('❌ Отклонено', 'rejUpl:' + stepState.sessionId + ':' + request.id),
          ]).extra({ parse_mode: 'HTML' }),
      );
    }*/
  }

  private async endRequestFilesForEquipment(sessionId: string, ctx: SceneContextMessageUpdate): Promise<void> {
    const uploadingInfo = await this.dbStorageService.findBy(sessionId);

    if (!uploadingInfo) {
      this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
      return;
    }
    
    const filesForUploading = uploadingInfo.files?.filter(e => e.status === RequestStatus.Confirmed);

    if (!filesForUploading) {
      this.logger.error(`Не найдены данные файлов для загрузки: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
      return;
    }

    const stepState = ctx.scene.state as UploadFilesSceneState;
    const recordsToAdd: ISheetUploadRecord[] = [];
    
    for (let req of filesForUploading) {
      if (req.status !== RequestStatus.Confirmed) continue;
      
      let record = recordsToAdd[req.id];
      if(!record){
        record = {
          maintenanceId: stepState.uploadingInfo.maintenanceId,
          equipmentName: req.equipmentName,
          engineerPersonId: stepState.user.person.id,
          confirmatorPersonId: req.confirmatorId,
          files: []
        };
      }
      const fileUrl = await this.uploadFile(req.file, ctx);
      if(fileUrl){
        record.files.push(fileUrl);
        recordsToAdd[req.id] = record;
      }
    }
    const maintenanceUploadingSheet = this.configurationService.maintenanceUploadingSheet;
    const rowForFillingIndex = await this.sheetsService.getNonEmptyRowIndex(maintenanceUploadingSheet);

    if (rowForFillingIndex < maintenanceUploadingSheet.startRow) {
      return;
    }

    const rows = [];
    for(let r of recordsToAdd){
      const rowData = [
        r.maintenanceId,
        r.equipmentName,
        r.engineerPersonId,
        r.confirmatorPersonId
      ];
      for(let f of r.files){
        rowData.push(f)
      }
      rows.push(rowData);
    }
    
    const cellsRange = maintenanceUploadingSheet.getRowsRange(maintenanceUploadingSheet.startColumnName, maintenanceUploadingSheet.photoEndColumn, rowForFillingIndex, rowForFillingIndex + rows.length);
    let updateResult = await this.sheetsService.updateCellsValues(maintenanceUploadingSheet.spreadSheetId, cellsRange, rows, 'USER_ENTERED');
    if(updateResult) {
      stepState.step = UploadFilesSteps.UploadingConfirmed;
    }
  }

  private async sendNextRequest(ctx: SceneContextMessageUpdate): Promise<void> {
    const stepState = ctx.scene.state as UploadFilesSceneState;

    if (!stepState.requestsToSend) return;

    const request = stepState.requestsToSend.shift();
    await this.sendNextRequestMessage(request, ctx);
    stepState.uploadingInfo.currentRequestIndex++;
  }

  private async sendNextRequestMessage(request: RequestFile, ctx: SceneContextMessageUpdate): Promise<void> {
    const stepState = ctx.scene.state as UploadFilesSceneState;
    await ctx.reply(
      request.message,
      Markup.inlineKeyboard([
        Markup.callbackButton('✅ Принято', 'confUpl:' + stepState.sessionId + ':' + request.id),
        Markup.callbackButton('❌ Отклонено', 'rejUpl:' + stepState.sessionId + ':' + request.id),
      ]).extra({ parse_mode: 'HTML' }),
    );

    stepState.uploadingInfo.currentRequestId = request.id;
  }

  public build(): BaseScene<SceneContextMessageUpdate> {
    const scene = new BaseScene(this.SceneName);

    scene.enter(async ctx => {
      const person = await this.personsStore.getPersonByUserName(ctx.from.username);
      ctx.scene.state = {
        user: {
          telegramId: ctx.from.id,
          person: person
        },
        step: UploadFilesSteps.Enter,
        uploadingInfo: new UploadingFilesInfo(),
      };
      await ctx.reply(
        'Введите <b>номер (ид)</b> квартального ТО для загрузки фото',
        Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra({ parse_mode: 'HTML' }),
      );
    });

    scene.leave(async (ctx, next) => {
      const stepState = ctx.scene.state as UploadFilesSceneState;
      if (stepState.step === UploadFilesSteps.Enter) {
        await next();
        return;
      }
      leave();
    });

    scene.hears(/.+/gi, async (ctx, next) => {
      if (ctx.message.text.startsWith('/')) {
        await next();
        return;
      }
      const stepState = ctx.scene.state as UploadFilesSceneState;

      if (stepState.step === UploadFilesSteps.Enter) {
        if (!/^(\d+)$/g.test(ctx.message.text)) {
          await ctx.reply(
            'Квартальное ТО с таким номером не найдено, введите корректный номер ТО или отмените команду',
            Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra(),
          );
          return;
        }

        stepState.uploadingInfo.maintenanceId = ctx.message.text;

        const columnParams: ColumnParam[] = [];
        const maintenanceSheet = this.configurationService.maintenanceSheet;

        columnParams.push({
          column: maintenanceSheet.idColumn,
          type: CompareType.Equal,
          value: stepState.uploadingInfo.maintenanceId,
        });
        const filterOptions: FilterOptions = {
          params: columnParams,
          range: maintenanceSheet,
        };

        const foundRow = await this.sheetsService.getFirstRow(filterOptions);
        if (!foundRow) {
          await ctx.reply(
            'Квартальное ТО с таким номером не найдено, введите корректный номер ТО или отмените команду',
            Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra(),
          );
          return;
        }

        let sskNumber = foundRow.values[maintenanceSheet.getColumnIndex(maintenanceSheet.sskNumberColumn)];
        if (sskNumber && sskNumber.length > 0) {
          stepState.uploadingInfo.sskNumber = sskNumber;
          const dateIndex = maintenanceSheet.getColumnIndex(maintenanceSheet.maintenanceDateColumn);
          await ctx.reply(
            `Вы хотите загрузить фото для Квартального ТО для ССК-<b>${sskNumber}</b>.` + ` Дата проведения <b>${foundRow.values[dateIndex]}</b>`,
            Markup.inlineKeyboard([Markup.callbackButton('✅Да', 'ConfirmId'), Markup.callbackButton('❌Нет', 'RejectId')]).extra({
              parse_mode: 'HTML',
            }),
          );
          return;
        }

        stepState.step = UploadFilesSteps.Uploading;
        await this.startRequestFilesForEquipment(ctx);
      }
    });

    scene.action('ConfirmId', async ctx => {
      const stepState = ctx.scene.state as UploadFilesSceneState;
      stepState.step = UploadFilesSteps.Uploading;
      await this.startRequestFilesForEquipment(ctx);
    });

    scene.action('RejectId', async ctx => {
      await ctx.scene.reenter();
    });

    scene.action('Cancel', async ctx => {
      await this.cancelCommand(ctx);
    });

    scene.command('cancel', async ctx => {
      await this.cancelCommand(ctx);
    });

    scene.on('photo', async ctx => {
      await ctx.reply(
        'Фото принимаются только БЕЗ СЖАТИЯ". Чтобы отправить фото правильно, нужно нажать на скрепку справа от поля ввода сообщения, выделить фото и справа вверху экрана нажать на три точки и выбрать "Отправить без сжатия"',
      );
    });

    scene.action(/confUpl:/, async ctx => {
      const stepState = ctx.scene.state as UploadFilesSceneState;
      const person = await this.personsStore.getPersonByUserName(ctx.from.username);
      if (
        stepState.step === UploadFilesSteps.Enter ||
        stepState.step === UploadFilesSteps.Cancelled ||
        stepState.step === UploadFilesSteps.UploadingConfirmed
      )
        return;
      const data = ctx.callbackQuery.data.split(':');
      const sessionId = data[1];
      const requestId = data[2];
      if (!requestId) {
        this.logger.error('Поле requestId пустое при подтверждении');
        return;
      }

      const uploadingInfo = await this.dbStorageService.findBy(sessionId);

      if (!uploadingInfo) {
        this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }

      const request = uploadingInfo.files.find(e => e.id === requestId);

      if (!request) {
        this.logger.error(`Не найдены данные файла для загрузки:${requestId}, ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }

      if (request.status === RequestStatus.Confirmed) {
        return;
      }

      request.status = RequestStatus.Confirmed;
      request.confirmatorId = person.id;
      await this.dbStorageService.update(uploadingInfo);
      if (uploadingInfo.files?.every(e => e.status === RequestStatus.Confirmed)) {
        await this.endRequestFilesForEquipment(sessionId, ctx);
        leave();
      }
    });

    scene.action(/rejUpl:/, async ctx => {
      const stepState = ctx.scene.state as UploadFilesSceneState;

      if (stepState.step !== UploadFilesSteps.Uploading) return;

      const data = ctx.callbackQuery.data.split(':');
      const sessionId = data[1];
      const requestId = data[2];
      if (!requestId) {
        this.logger.error('Поле requestId пустое при отклонении');
        return;
      }

      const uploadingInfo = await this.dbStorageService.findBy(sessionId);

      if (!uploadingInfo) {
        this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }

      const request = uploadingInfo.files.find(e => e.id === requestId);

      if (!request) {
        this.logger.error(`Не найдены данные файла для загрузки:${requestId}, ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }

      request.status = RequestStatus.Rejected;
      await this.dbStorageService.update(uploadingInfo);
      const requestToSend = stepState.uploadingInfo.requests.find(e => e.id === requestId);
      stepState.requestsToSend.push(requestToSend);
      await this.sendNextRequest(ctx);
    });

    scene.on('document', async ctx => {
      const stepState = ctx.scene.state as UploadFilesSceneState;

      if (stepState.step !== UploadFilesSteps.Uploading) return;

      const doc = ctx.message.document;
      if (doc) {
        const fileUrl = await ctx.telegram.getFileLink(doc.file_id);
        const fileName = fileUrl.split('/').pop();

        if (fileUrl) {
          const request = stepState.uploadingInfo.requests.find(e => e.id === stepState.uploadingInfo.currentRequestId);
          await this.sendFileForUploading(
            request.id,
            {
              url: fileUrl,
              name: fileName,
              size: doc.file_size,
            },
            ctx,
          );
        }

        if (stepState.requestsToSend && stepState.requestsToSend.length > 0) {
          await this.sendNextRequest(ctx);
        } else {
          stepState.step = UploadFilesSteps.Completed;
        }
      }
    });

    return scene;
  }
}
