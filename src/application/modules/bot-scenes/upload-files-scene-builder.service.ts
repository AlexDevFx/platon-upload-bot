import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseScene, Markup, Stage, Telegraf } from 'telegraf';
import { SceneContextMessageUpdate } from 'telegraf/typings/stage';
import * as fs from 'fs';
import { LoggerService } from 'nest-logger';
import { FileStorageService, IUploadResult } from '../../../core/sheets/filesStorage/file-storage.service';
import { SheetsService } from '../../../core/sheets/sheets.service';
import { ConfigurationService } from '../../../core/config/configuration.service';
import { RequestFile, UploadedFile, UploadingFilesInfo } from '../../../core/sheets/filesUploading/uploadingFilesInfo';
import { ColumnParam, CompareType, FilterOptions } from '../../../core/sheets/filterOptions';
import { IUploadedEquipment, UploadedEquipmentStore, UploadingType } from '../../../core/sheets/config/uploadedEquipmentStore';
import { v4 as uuidv4 } from 'uuid';
import { DbStorageService } from '../../../core/dataStorage/dbStorage.service';
import { JobsService } from '../../../core/jobs/jobs.service';
import { PersonsStore, UserRoles } from '../../../core/sheets/config/personsStore';
import { SskEquipmentStore } from '../../../core/sheets/config/sskEquipmentStore';
import { ISheetUploadRecord } from '../../../core/jobs/isheet-upload.record';
import { UploadFilesSceneState, UploadFilesSteps } from './UploadQuadMaintenanceScene';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IAdminHandleUploadRequest } from '../../../core/event/adminHandleUploadRequest';
import { firstValueFrom, take } from 'rxjs';
import moment = require('moment');
import { TelegrafContext } from 'telegraf/typings/context';
import { UploadFilesSessionStorageService } from '../../../core/dataStorage/uploadFilesSessionStorage.service';
import { UploadFilesSceneSession } from '../../../core/dataStorage/models/filesUploading/uploadFilesSceneSession';
import {FileData, RequestedFile, RequestStatus} from '../../../core/filesUploading/userUploadingInfoDto';

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
    private readonly sskEquipmentStore: SskEquipmentStore,
    private readonly eventEmitter: EventEmitter2,
    private readonly uploadFilesSessionStorageService: UploadFilesSessionStorageService,
  ) {}

  private async downloadImage(fileUrl: string, filePathToSave: string): Promise<void> {
    const writer = fs.createWriteStream(filePathToSave);
    const source = this.httpService.get(fileUrl, { responseType: 'stream' }).pipe(take(1));
    const response = await firstValueFrom(source);
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

  private async uploadFile(file: UploadedFile, ctx: TelegrafContext, tryNumber: number = 0): Promise<string> {
    const stepState = await this.getSession(ctx);
    
    if(!stepState){
      await ctx.reply('Данные по загрузке на сохранились. Попробуйте отменить команду(/cancel) и загрузить ещё раз');
      return undefined;
    }

    if (!file) {
      await ctx.reply('Нет загруженного файла');
      return undefined;
    }

    try {
      const result = await this.createAndShareFolder(stepState.uploadingInfo.sskNumber, ctx);
      await this.downloadImage(file.url, file.name);
      const uploadResult = await this.fileStorageService.upload(file.name, file.size, result.fileId, null);

      if (!stepState.uploadingInfo.folderUrl) {
        stepState.uploadingInfo.folderUrl = result.fileUrl;
        await this.uploadFilesSessionStorageService.update(stepState);
      }
      return uploadResult.fileUrl;
    } catch (e) {
      this.logger.error(`File uploading error: ${file.url}, ${file.name}. Try: ${tryNumber}`, e);
      if (tryNumber < 10) {
        return await this.uploadFile(file, ctx, tryNumber + 1);
      }
    }
    return undefined;
  }

  private async sendFileForUploading(requestId: string, file: FileData, ctx: TelegrafContext): Promise<boolean> {
    const stepState = await this.getSession(ctx);

    if (!file) {
      await ctx.reply('Нет загруженного файла');
      return false;
    }
    const request = stepState.uploadingInfo.requests.find(e => e.id === requestId);
    if (request) {
      const uploadingInfo = await this.dbStorageService.findBySessionId(stepState.sessionId);
      const requestedFile = new RequestedFile(requestId, request.equipmentId, request.equipmentName, {
        name: file.name,
        size: file.size,
        url: file.url,
      });
      
      let previousFile = stepState.uploadingInfo.files.find(e => e.id === requestId);
      if(previousFile){
        previousFile = requestedFile;
      }
      else{
        stepState.uploadingInfo.files.push(requestedFile);
      }
      
      await this.uploadFilesSessionStorageService.update(stepState);

      if (uploadingInfo) {
        uploadingInfo.files.push(requestedFile);

        return await this.dbStorageService.update(uploadingInfo);
      }
    }

    return false;
  }

  private async cancelCommand(ctx: TelegrafContext): Promise<void> {
    const stepState = await this.getSession(ctx);
    if(stepState){
      stepState.step = UploadFilesSteps.Cancelled;
      await this.uploadFilesSessionStorageService.update(stepState);
    }
   
    await ctx.reply('Команда отменена');
    await this.leaveScene(ctx);
  }

  private async createAndShareFolder(sskNumber: string, ctx: TelegrafContext): Promise<IUploadResult> {
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

  private async createRequestsForFiles(ctx: TelegrafContext): Promise<void> {
    const equipmentForUploading = await this.uploadedEquipmentStore.getData();

    if (!equipmentForUploading) return;
    const stepState = await this.getSession(ctx);

    if(!stepState){
      await ctx.reply('Данные по загрузке на сохранились. Попробуйте отменить команду(/cancel) и загрузить ещё раз');
      return undefined;
    }

    await this.dbStorageService.insert({
      username: ctx.from.username,
      userId: ctx.from.id,
      files: [],
      maintenanceId: stepState.uploadingInfo.maintenanceId,
      sessionId: stepState.sessionId,
    });

    /*this.eventEmitter.on('confUpl:' + stepState.sessionId, async (handleUploadRequest: IAdminHandleUploadRequest) => {
      await this.confirmUploadRequest(ctx, handleUploadRequest);
    });

    this.eventEmitter.on('rejUpl:' + stepState.sessionId, async (handleUploadRequest: IAdminHandleUploadRequest) => {
      await this.rejectUploadRequest(ctx, handleUploadRequest);
    });*/

    const sskEquipments = (await this.sskEquipmentStore.getData()).filter(e => e.sskNumber === stepState.uploadingInfo.sskNumber);

    const addedEquipments = [];
    stepState.uploadingInfo.requests = [];
    stepState.uploadingInfo.files = [];
    stepState.uploadingInfo.currentRequestIndex = 0;
    stepState.requestsToSend = [];
    let n = 0;

    for (let eq of equipmentForUploading) {
      //if (n > 3) break; //for debugging
      if (eq.type === UploadingType.Undefined) continue;

      n++;

      let message = `<b>${eq.name}</b>\n`;
      let additionalInfo = '';
      if (eq.type === UploadingType.Ssk) {
        let sskEquipment = sskEquipments.find(e => e.name === eq.name && !addedEquipments.find(a => a === e.id));
        while (sskEquipment) {
          addedEquipments.push(sskEquipment.id);
          const info = [];
          for (let ai of sskEquipment.additionalInfo) {
            if (ai.value && ai.value !== '') {
              info.push(`${ai.name} <b>${ai.value}</b>`);
            }
          }
          additionalInfo = info.join(',');
          if (additionalInfo !== '') additionalInfo += '\n';
          UploadFilesSceneBuilder.addRequestToState(sskEquipment.id, additionalInfo, message, stepState, eq);
          sskEquipment = sskEquipments.find(e => e.name === eq.name && !addedEquipments.find(a => a === e.id));
        }
      }
      if (eq.type === UploadingType.All) {
        UploadFilesSceneBuilder.addRequestToState(eq.name, additionalInfo, message, stepState, eq);
      }
    }
    await this.uploadFilesSessionStorageService.update(stepState);
  }

  private static addRequestToState(
    equipmentId: string,
    info: string,
    message: string,
    state: UploadFilesSceneState,
    equipment: IUploadedEquipment,
  ): void {
    for (let exml of equipment.examples) {
      const requestFile = new RequestFile(
        uuidv4()
          .replace('-', '')
          .substr(0, 8),
        equipmentId,
        equipment.name,
        `${message}${info}${exml.description}`,
        exml.url,
      );
      state.uploadingInfo.requests.push(requestFile);
      state.requestsToSend.push(requestFile);
    }
  }

  private async startRequestFilesForEquipment(ctx: TelegrafContext): Promise<void> {
    await this.createRequestsForFiles(ctx);
    await this.sendNextRequest(ctx);
  }

  private async endRequestFilesForEquipment(sessionId: string, ctx: TelegrafContext): Promise<void> {
    const uploadingInfo = await this.dbStorageService.findBySessionId(sessionId);

    if (!uploadingInfo) {
      this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
      return;
    }
    const stepState = await this.getSessionById(sessionId);
    const filesForUploading = stepState.uploadingInfo?.files?.filter(e => e.status === RequestStatus.Confirmed);

    if (!filesForUploading) {
      this.logger.error(`Не найдены данные файлов для загрузки: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
      return;
    }

    const newRecords: ISheetUploadRecord[] = [];

    await ctx.telegram.sendMessage(ctx.chat.id, 'Администратор принял все загруженные фото, благодарим!', { parse_mode: 'HTML' });

    const result = await this.jobsService.startUploadingFiles({
      files: filesForUploading,
      sessionId: sessionId,
      maintenanceId: stepState.uploadingInfo.maintenanceId,
      fromChatId: ctx.chat.id,
      engineerPersonId: stepState.user.person.id,
      sskNumber: stepState.uploadingInfo.sskNumber,
    });

    if (result) {
      stepState.step = UploadFilesSteps.UploadingConfirmed;
      await this.uploadFilesSessionStorageService.update(stepState);
    }
  }

  private async sendNextRequest(ctx: TelegrafContext): Promise<void> {
    const stepState = await this.getSession(ctx);

    if(!stepState){
      await ctx.reply('Данные по загрузке на сохранились. Попробуйте отменить команду(/cancel) и загрузить ещё раз');
      return undefined;
    }

    if (!stepState.requestsToSend) return;

    const request = stepState.requestsToSend.shift();
    await this.sendNextRequestMessage(request, ctx, stepState);
    stepState.uploadingInfo.currentRequestIndex++;
    await this.uploadFilesSessionStorageService.update(stepState);
  }

  private async sendNextRequestMessage(request: RequestFile, ctx: TelegrafContext, stepState: UploadFilesSceneSession): Promise<void> {
    await ctx.replyWithPhoto(
      { source: request.photoFile },
      {
        caption: request.message,
        reply_markup: Markup.inlineKeyboard([
          Markup.callbackButton('✅ Принять', 'confUpl:' + stepState.sessionId + ':' + request.id),
          Markup.callbackButton('❌ Отклонить', 'rejUpl:' + stepState.sessionId + ':' + request.id),
        ]),
        parse_mode: 'HTML',
      },
    );

    stepState.uploadingInfo.currentRequestId = request.id;
  }

  private async confirmUploadRequest(ctx: TelegrafContext, handleUploadRequest: IAdminHandleUploadRequest): Promise<boolean> {
    const stepState = await this.getSessionById(handleUploadRequest.sessionId);
    const person = await this.personsStore.getPersonByUserName(handleUploadRequest.username);
    if (
      person?.role !== UserRoles.Admin ||
      stepState.step === UploadFilesSteps.Enter ||
      stepState.step === UploadFilesSteps.Cancelled ||
      stepState.step === UploadFilesSteps.UploadingConfirmed
    )
      return false;

    const sessionId = handleUploadRequest.sessionId;
    const requestId = handleUploadRequest.requestId;
    if (!requestId) {
      this.logger.error('Поле requestId пустое при подтверждении');
      return false;
    }

    const uploadingInfo = stepState.uploadingInfo;

    if (!uploadingInfo) {
      this.logger.error(
        `Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}. Data: ${JSON.stringify(stepState)}`,
      );
      return false;
    }

    const request = uploadingInfo.requests.find(e => e.id === requestId);

    if (!request) {
      this.logger.error(
        `Не найдены данные файла для загрузки:${requestId}, ${ctx.from.username}, ${ctx.from.id}, ${sessionId}. Data: ${JSON.stringify(
          uploadingInfo,
        )}`,
      );
      return false;
    }

    request.status = RequestStatus.Confirmed;
    request.confirmatorId = person.id;

    const sentFile = stepState.uploadingInfo.files.find(e => e.id === requestId);

    if (sentFile) {
      sentFile.status = RequestStatus.Confirmed;
    }

    await this.uploadFilesSessionStorageService.update(stepState);

    if (handleUploadRequest.messageId) this.eventEmitter.emit(`confUplResult:${handleUploadRequest.messageId}`);
    else await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('✅ Принято', 'Approved:' + sessionId + ':' + requestId)]]));

    if (
      stepState.uploadingInfo.files?.every(e => e.status === RequestStatus.Confirmed || e.status === RequestStatus.Rejected) &&
      stepState.step === UploadFilesSteps.Completed &&
      stepState.requestsToSend.length < 1
    ) {
      await this.endRequestFilesForEquipment(sessionId, ctx);
      await this.leaveScene(ctx);
    }
    return true;
  }

  private async rejectUploadRequest(ctx: TelegrafContext, handleUploadRequest: IAdminHandleUploadRequest): Promise<boolean> {
    const stepState = await this.getSessionById(handleUploadRequest.sessionId);
    const person = await this.personsStore.getPersonByUserName(handleUploadRequest.username);
    if (
      stepState.step === UploadFilesSteps.Enter ||
      stepState.step === UploadFilesSteps.Cancelled ||
      stepState.step === UploadFilesSteps.UploadingConfirmed
    )
      return false;

    const sessionId = handleUploadRequest.sessionId;
    const requestId = handleUploadRequest.requestId;
    if (!requestId) {
      this.logger.error('Поле requestId пустое при отклонении');
      return false;
    }

    const uploadingInfo = stepState.uploadingInfo;

    if (!uploadingInfo) {
      this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
      return false;
    }

    const request = uploadingInfo.requests.find(e => e.id === requestId);

    if (!request) {
      this.logger.error(
        `Не найдены данные файла для загрузки:${requestId}, ${ctx.from.username}, ${ctx.from.id}, ${sessionId}. Data: ${JSON.stringify(
          uploadingInfo,
        )}`,
      );
      return false;
    }
    request.status = RequestStatus.Rejected;

    const sentFile = stepState.uploadingInfo.files.find(e => e.id === requestId);

    if (sentFile) {
      sentFile.status = RequestStatus.Rejected;
    }

    const requestToSend = stepState.uploadingInfo.requests.find(e => e.id === requestId);

    const newFileRequest = new RequestFile(
      requestToSend.id,
      requestToSend.equipmentId,
      requestToSend.equipmentName,
      requestToSend.message,
      requestToSend.photoFile,
    );
    // stepState.uploadingInfo.requests = stepState.uploadingInfo.requests.filter(e => e.id !== requestId);
    //stepState.uploadingInfo.requests.push(newFileRequest);
    stepState.requestsToSend.unshift(newFileRequest);

    if (stepState.requestsToSend.length === 1 && stepState.step === UploadFilesSteps.Completed) await this.sendNextRequest(ctx);

    stepState.step = UploadFilesSteps.Uploading;
    await this.uploadFilesSessionStorageService.update(stepState);

    if (handleUploadRequest.messageId) this.eventEmitter.emit(`rejUplResult:${handleUploadRequest.messageId}`);
    else
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('❌ Отклонено', 'Rejected:' + sessionId + ':' + requestId)]]));
    return true;
  }

  public async enterScene(ctx: TelegrafContext): Promise<void> {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') {
      await ctx.reply('Бот работает только в групповых чатах');
      return;
    }
    const person = await this.personsStore.getPersonByUserName(ctx.from.username);
    const newSession = {
      user: {
        telegramId: ctx.from.id,
        person: person,
      },
      step: UploadFilesSteps.Enter,
      uploadingInfo: new UploadingFilesInfo(),
      sessionId: UploadFilesSceneBuilder.getSessionId(ctx),
      requestsToSend: [],
    };
    const existedSession = await this.uploadFilesSessionStorageService.find(newSession.sessionId);
    if (existedSession) {
      if (await this.uploadFilesSessionStorageService.delete(newSession.sessionId)) {
        await this.uploadFilesSessionStorageService.insert(newSession);
      } else {
        existedSession.user = newSession.user;
        existedSession.step = newSession.step;
        existedSession.uploadingInfo = newSession.uploadingInfo;
        existedSession.requestsToSend = newSession.requestsToSend;
        await this.uploadFilesSessionStorageService.update(existedSession);
      }
    } else {
      await this.uploadFilesSessionStorageService.insert(newSession);
    }

    await ctx.reply(
      'Введите <b>номер (ид)</b> квартального ТО для загрузки фото',
      Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra({ parse_mode: 'HTML' }),
    );
  }

  private async leaveScene(ctx: TelegrafContext): Promise<void> {
    await this.uploadFilesSessionStorageService.delete(UploadFilesSceneBuilder.getSessionId(ctx));
  }

  private static getSessionId(ctx: TelegrafContext): string {
    return `${ctx.chat.id}_${ctx.from.id}`;
  }

  private async getSession(ctx: TelegrafContext): Promise<UploadFilesSceneSession> {
    return await this.uploadFilesSessionStorageService.find(UploadFilesSceneBuilder.getSessionId(ctx));
  }

  private async getSessionById(sessionId: string): Promise<UploadFilesSceneSession> {
    return await this.uploadFilesSessionStorageService.find(sessionId);
  }

  private bot;

  public build(bot: Telegraf<TelegrafContext>): BaseScene<SceneContextMessageUpdate> {
    const scene = new BaseScene(this.SceneName);
    this.bot = bot;

    bot.hears(/.+/gi, async (ctx, next) => {
      if (ctx.message.text.startsWith('/')) {
        await next();
        return;
      }
      const stepState = await this.getSession(ctx);

      if (!stepState) {
        // await this.enterScene(ctx);
        return;
      }

      if (stepState?.step === UploadFilesSteps.Enter) {
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
            Markup.inlineKeyboard([Markup.callbackButton('✅ Да', 'ConfirmId'), Markup.callbackButton('❌ Нет', 'RejectId')]).extra({
              parse_mode: 'HTML',
            }),
          );
          return;
        }

        stepState.step = UploadFilesSteps.Uploading;
        await this.uploadFilesSessionStorageService.update(stepState);
        await this.startRequestFilesForEquipment(ctx);
      }
    });

    bot.action('ConfirmId', async ctx => {
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('✅ Да', 'ConfirmedId')]]));
      const stepState = await this.getSession(ctx);
      stepState.step = UploadFilesSteps.Uploading;
      await this.uploadFilesSessionStorageService.update(stepState);
      await this.startRequestFilesForEquipment(ctx);
    });

    bot.action('RejectId', async ctx => {
      await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('❌ Нет', 'RejectedId')]]));
      await this.enterScene(ctx);
    });

    bot.action('Cancel', async ctx => {
      await this.cancelCommand(ctx);
    });

    bot.command('cancel', async ctx => {
      await this.cancelCommand(ctx);
    });

    bot.command('quad', async ctx => {
      const session = await this.getSession(ctx);

      if (
        !session ||
        session.step === UploadFilesSteps.UploadingConfirmed ||
        session.step === UploadFilesSteps.Cancelled ||
        session.step === UploadFilesSteps.Completed
      ) {
        await this.enterScene(ctx);
      } else {
        await ctx.reply('Завершите предыдущую загрузку сообщений или отмените, нажав на команду /cancel');
      }
    });

    bot.command('year', async ctx => {
      await ctx.reply('Завершите предыдущую загрузку сообщений или отмените, нажав на команду /cancel');
    });

    bot.on('photo', async ctx => {
      await ctx.reply(
        'Фото принимаются только БЕЗ СЖАТИЯ". Чтобы отправить фото правильно, нужно нажать на скрепку справа от поля ввода сообщения, выделить фото и справа вверху экрана нажать на три точки и выбрать "Отправить без сжатия"',
      );
    });

    bot.action(/confUpl:/, async ctx => {
      const data = ctx.callbackQuery.data.split(':');
      const sessionId = data[1];
      const requestId = data[2];

      await this.confirmUploadRequest(ctx, {
        username: ctx.from.username,
        userId: ctx.from.id,
        sessionId: sessionId,
        requestId: requestId,
        messageId: undefined,
      });
    });

    bot.action(/rejUpl:/, async ctx => {
      const data = ctx.callbackQuery.data.split(':');
      const sessionId = data[1];
      const requestId = data[2];

      if (
        !(await this.rejectUploadRequest(ctx, {
          username: ctx.from.username,
          userId: ctx.from.id,
          sessionId: sessionId,
          requestId: requestId,
          messageId: undefined,
        }))
      ) {
        return;
      }

      const uploadingInfo = await this.dbStorageService.findBySessionId(sessionId);
      if (!uploadingInfo) {
        this.logger.error(`Не найдены данные загрузки для пользователя: ${ctx.from.username}, ${ctx.from.id}, ${sessionId}`);
        return;
      }
    });

    bot.on('document', async ctx => {
      const stepState = await this.getSession(ctx);

      if (!(stepState?.step === UploadFilesSteps.Uploading || stepState?.step === UploadFilesSteps.Completed)) return;

      const doc = ctx.message.document;
      if (doc) {
        const fileUrl = await ctx.telegram.getFileLink(doc.file_id);
        const fileName = fileUrl.split('/').pop();

        if (fileUrl) {
          // const request = stepState.uploadingInfo.requests.find(e => e.id === stepState.uploadingInfo.currentRequestId);
          await this.sendFileForUploading(
             stepState.uploadingInfo.currentRequestId,
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

          await this.uploadFilesSessionStorageService.update(stepState);
          await ctx.reply(
            '<b>Фото приняты, благодарим! Дождитесь проверки всех фото администратором, если какое-то фото будет отклонено администратором, его нужно будет загрузить снова, изменив так, чтобы оно подходило под требования</b>',
            { parse_mode: 'HTML' },
          );
        }
      }
    });
    return scene;
  }
}
