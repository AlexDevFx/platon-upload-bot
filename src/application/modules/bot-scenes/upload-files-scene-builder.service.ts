import {Injectable} from '@nestjs/common';
import {HttpService} from '@nestjs/axios';
import {BaseScene, Markup, Stage} from 'telegraf';
import {SceneContextMessageUpdate} from 'telegraf/typings/stage';
import * as fs from 'fs';
import {LoggerService} from 'nest-logger';
import {FileStorageService, IUploadResult} from '../../../core/sheets/filesStorage/file-storage.service';
import {SheetsService} from '../../../core/sheets/sheets.service';
import {ConfigurationService} from '../../../core/config/configuration.service';
import {RequestFile, UploadedFile, UploadingFilesInfo} from '../../../core/sheets/filesUploading/uploadingFilesInfo';
import {CallbackButton} from 'telegraf/typings/markup';
import {ColumnParam, CompareType, FilterOptions} from '../../../core/sheets/filterOptions';
import {UploadedEquipmentStore, UploadingType} from '../../../core/sheets/config/uploadedEquipmentStore';
import {v4 as uuidv4} from 'uuid';
import {DbStorageService} from '../../../core/dataStorage/dbStorage.service';
import {JobsService} from '../../../core/jobs/jobs.service';
import {RequestedFile, RequestStatus} from '../../../core/dataStorage/filesUploading/userUploadingInfoDto';
import moment = require('moment');

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

  private async uploadFile(file: UploadedFile, ctx: SceneContextMessageUpdate): Promise<boolean> {
    const stepState = ctx.scene.state as UploadFilesSceneState;

    if (!file) {
      await ctx.reply('Нет загруженного файла');
      return false;
    }

    const result = await this.createAndShareFolder(stepState.uploadingInfo.sskNumber, ctx);
    await this.downloadImage(file.url, file.name);
    const uploadResult = await this.fileStorageService.upload(file.name, file.size, result.fileId, null);

    if (!stepState.uploadingInfo.folderUrl) {
      stepState.uploadingInfo.folderUrl = result.fileUrl;
    }

    return uploadResult !== undefined;
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
        url: file.url
      });
      if(uploadingInfo){
        uploadingInfo.files.push(requestedFile)
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
    let result = await this.fileStorageService.getOrCreateFolder(sskNumber + ' ССК', null, null);

    if (!result.success) {
      await ctx.reply(`Не удалось создать папку ${sskNumber}`);
    }

    const filesFolderName = moment().format('YYYY.MM.DD');
    result = await this.fileStorageService.getOrCreateFolder(filesFolderName, result.fileId, null);

    if (!result.success) {
      await ctx.reply(`Не удалось создать папку ${filesFolderName}`);
    }

    result = await this.fileStorageService.shareFolderForReading(result.fileId);
    if (!result.success) {
      await ctx.reply(`Не удалось получить доступ к папке ${filesFolderName}`);
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
    const equipmentForUploading = await this.uploadedEquipmentStore.getEquipment();

    if (!equipmentForUploading) return;
    const stepState = ctx.scene.state as UploadFilesSceneState;

    stepState.sessionId = await this.dbStorageService.insert({
      username: ctx.from.username,
      userId: ctx.from.id,
      files: []
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

    const rows = await this.sheetsService.getFilteredRows(filterOptions);
    const equipmentNameIndex = equipmentSheet.getColumnIndex(equipmentSheet.equipmentNameColumn);
    const sskNumberIndex = equipmentSheet.getColumnIndex(equipmentSheet.sskNumberColumn);
    const idIndex = equipmentSheet.getColumnIndex(equipmentSheet.idColumn);
    
    const additionalColumns = [
      {index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber1Column), name: 'Серийный №1'},
      {index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber2Column), name: 'Серийный №2'},
      {index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber3Column), name: 'Серийный №3'},
      {index: equipmentSheet.getColumnIndex(equipmentSheet.rowNumberColumn), name: 'Полоса'},
      {index: equipmentSheet.getColumnIndex(equipmentSheet.modelNameColumn), name: 'Модель'},
      {index: equipmentSheet.getColumnIndex(equipmentSheet.typeColumn), name: 'Тип'}
    ];
    
    const addedEquipments = [];
    stepState.uploadingInfo.requests = [];
    stepState.uploadingInfo.currentRequestIndex = 0;

    for (let eq of equipmentForUploading) {
      if (eq.type === UploadingType.Undefined) continue;
      let message = `<b>${eq.name}</b>\n`;
      let additionalInfo = '';
      let equipmentId = eq.name;
      if (eq.type === UploadingType.Ssk) {
        const sskEquipment = rows.filter(e => e.values[equipmentNameIndex] === eq.name && !addedEquipments.some(ae => ae === e.values[idIndex]))[0];
        if (sskEquipment) {
          addedEquipments.push(sskEquipment.values[idIndex]);
          const info = [];
          for(let col of additionalColumns){
            if(sskEquipment.values[col.index] && sskEquipment.values[col.index] !== ''){
              info.push(`${col.name} <b>${sskEquipment.values[col.index]}</b>`);
            }
          }
          additionalInfo = info.join(',');
          if(additionalInfo !== '') additionalInfo += '\n';
          equipmentId = sskEquipment.values[idIndex];
        }
      }
      for (let exml of eq.examples) {
        const requestFile = new RequestFile(uuidv4().replace('-', '').substr(0, 8), equipmentId, eq.name, `${message}${additionalInfo}${exml.description}`);
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

    if(!uploadingInfo){
      this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
      return;
    }
    
    const confirmedStatus = RequestStatus.Confirmed as number;
    const filesForUploading = uploadingInfo.files?.filter(e => e.status === confirmedStatus);

    if(!filesForUploading){
      this.logger.error(`Не найдены данные файлов для загрузки: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
      return;
    }
    
    for(let req of filesForUploading){
      if(req.status !== confirmedStatus) continue;
      await this.uploadFile(req.file, ctx);
    }

    const stepState = ctx.scene.state as UploadFilesSceneState;
    stepState.step = UploadFilesSteps.UploadingConfirmed;
  }

  private async sendNextRequest(ctx: SceneContextMessageUpdate): Promise<void> {
    const stepState = ctx.scene.state as UploadFilesSceneState;

    if (!stepState.requestsToSend) return;

    const request = stepState.requestsToSend.shift();
    await this.sendNextRequestMessage(request, ctx);
    stepState.uploadingInfo.currentRequestIndex++;
  }
  
  private async sendNextRequestMessage(request: RequestFile, ctx: SceneContextMessageUpdate): Promise<void>{
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
      ctx.scene.state = {
        user: {
          telegramId: ctx.from.id,
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

      if (stepState.step !== UploadFilesSteps.Uploading) return;
      const data = ctx.callbackQuery.data.split(':');
      const sessionId = data[1];
      const requestId = data[2];
      if (!requestId) {
        this.logger.error('Поле requestId пустое при подтверждении');
        return;
      }

      const uploadingInfo = await this.dbStorageService.findBy(sessionId);
      
      if(!uploadingInfo){
        this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }
      
      const request = uploadingInfo.files.find(e => e.id === requestId);
      
      if (!request) {
        this.logger.error(`Не найдены данные файла для загрузки:${requestId}, ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }
      
      if(request.status === (RequestStatus.Confirmed as number)){
        return;
      }
      
      request.setStatus(RequestStatus.Confirmed);
      await this.dbStorageService.update(uploadingInfo);
      const confirmedStatus = RequestStatus.Confirmed as number;
      if(uploadingInfo.files?.every(e => e.status === confirmedStatus)){
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

      if(!uploadingInfo){
        this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }

      const request = uploadingInfo.files.find(e => e.id === requestId);

      if (!request) {
        this.logger.error(`Не найдены данные файла для загрузки:${requestId}, ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }
      
      request.setStatus(RequestStatus.Rejected);
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
