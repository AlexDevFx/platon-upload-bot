import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { BaseScene, Markup, Telegraf } from 'telegraf';
import { SceneContextMessageUpdate } from 'telegraf/typings/stage';
import * as fs from 'fs';
import { LoggerService } from 'nest-logger';
import { FileStorageService, IUploadResult } from '../../../core/sheets/filesStorage/file-storage.service';
import { SheetsService } from '../../../core/sheets/sheets.service';
import { ConfigurationService } from '../../../core/config/configuration.service';
import { RequestFile, UploadingFilesInfo } from '../../../core/sheets/filesUploading/uploadingFilesInfo';
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
import {catchError, firstValueFrom, take} from 'rxjs';
import { TelegrafContext } from 'telegraf/typings/context';
import { UploadFilesSessionStorageService } from '../../../core/dataStorage/uploadFilesSessionStorage.service';
import { UploadFilesSceneSession, UploadType } from '../../../core/dataStorage/models/filesUploading/uploadFilesSceneSession';
import { FileData, RequestedFile, RequestStatus } from '../../../core/filesUploading/userUploadingInfoDto';
import { YearUploadingEquipmentStore } from '../../../core/sheets/config/yearUploadingEquipmentStore';
import { YearSskEquipmentStore } from '../../../core/sheets/config/yearSskEquipmentStore';
import moment = require('moment');

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
    private readonly yearSskEquipmentStore: YearSskEquipmentStore,
    private readonly eventEmitter: EventEmitter2,
    private readonly uploadFilesSessionStorageService: UploadFilesSessionStorageService,
    private readonly yearUploadingEquipmentStore: YearUploadingEquipmentStore,
  ) {}

  private async downloadImage(fileUrl: string, filePathToSave: string): Promise<boolean> {
    let result = false;
    try {
      const source = this.httpService.get(fileUrl, { responseType: 'stream' }).pipe(
          take(1),
          catchError((err, c) => {
            throw 'Download file method failed:' + err;
          }),
      );
      const resp = await firstValueFrom(source, { defaultValue: undefined });
      if (resp && resp.status === 200 && resp.data) {
        return await new Promise<boolean>((res, rej) => {
          const writer = fs.createWriteStream(filePathToSave);
          resp.data.pipe(writer);
          writer.on('finish', () => {
            res(true);
          });
          writer.on('error', rej);
        });
      } else {
        this.logger.error(`Download file method failed: ${resp?.status ?? -1}`);
      }
    } catch (e) {
      this?.logger?.error('Download file method failed', e);
    }

    return result;
  }

  private getQuarter(): number {
    const month = moment().month();
    return month % 3 === 0 ? month / 3 : Math.floor(month / 3) + 1;
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
      const requestedFile = new RequestedFile(
        requestId,
        request.equipmentId,
        request.equipmentName,
        request.code,
        {
          url: file.url,
          name: file.name,
          size: file.size,
          fileId: file.fileId,
          path: file.path
        },
        request.index,
      );

      let previousFile = stepState.uploadingInfo.files.find(e => e.id === requestId);
      if (previousFile) {
        previousFile = requestedFile;
      } else {
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
    if (stepState) {
      stepState.step = UploadFilesSteps.Cancelled;
      await this.uploadFilesSessionStorageService.update(stepState);
    }

    await ctx.reply('Команда отменена');
    await this.leaveScene(ctx);
  }

  private async createQuadRequestsForFiles(ctx: TelegrafContext): Promise<void> {
    const equipmentForUploading = await this.uploadedEquipmentStore.getData();

    if (!equipmentForUploading) return;
    const stepState = await this.getSession(ctx);

    if (!stepState) {
      await ctx.reply('Данные по загрузке не сохранились. Попробуйте отменить команду (/cancel) и загрузить ещё раз');
      return undefined;
    }

    await this.dbStorageService.insert({
      username: ctx.from.username,
      userId: ctx.from.id,
      files: [],
      maintenanceId: stepState.uploadingInfo.maintenanceId,
      sessionId: stepState.sessionId,
    });

    const sskEquipments = (await this.sskEquipmentStore.getData()).filter(e => e.sskNumber === stepState.uploadingInfo.sskNumber);

    const addedEquipments = [];
    stepState.uploadingInfo.requests = [];
    stepState.uploadingInfo.files = [];
    stepState.uploadingInfo.currentRequestIndex = 0;
    stepState.requestsToSend = [];
    let n = 0;

    for (let eq of equipmentForUploading) {
      //if (n > 4) break; //for debugging
      if (eq.type === UploadingType.Undefined || eq.examples.length < 1) continue;

      n++;

      let message = `<b>${eq.name}</b>\n`;
      let additionalInfo = '';
      if (eq.type === UploadingType.Ssk) {
        let sskEquipment = sskEquipments.find(e => e.name === eq.name && !addedEquipments.find(a => a === e.id));
        let equipmentIndex = 1;
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
          UploadFilesSceneBuilder.addRequestToState(sskEquipment.id, additionalInfo, message, stepState, eq, equipmentIndex++);
          sskEquipment = sskEquipments.find(e => e.name === eq.name && !addedEquipments.find(a => a === e.id));
        }
      }
      if (eq.type === UploadingType.All) {
        UploadFilesSceneBuilder.addRequestToState(eq.name, additionalInfo, message, stepState, eq, 1);
      }
    }
    await this.uploadFilesSessionStorageService.update(stepState);
  }

  private async createYearRequestsForFiles(ctx: TelegrafContext): Promise<void> {
    const equipmentForUploading = await this.yearUploadingEquipmentStore.getData();

    if (!equipmentForUploading) return;
    const stepState = await this.getSession(ctx);

    if (!stepState) {
      await ctx.reply('Данные по загрузке не сохранились. Попробуйте отменить команду (/cancel) и загрузить ещё раз');
      return undefined;
    }

    await this.dbStorageService.insert({
      username: ctx.from.username,
      userId: ctx.from.id,
      files: [],
      maintenanceId: stepState.uploadingInfo.maintenanceId,
      sessionId: stepState.sessionId,
    });

    const sskEquipments = (await this.yearSskEquipmentStore.getData()).filter(e => e.sskNumber === stepState.uploadingInfo.sskNumber);

    stepState.uploadingInfo.requests = [];
    stepState.uploadingInfo.files = [];
    stepState.uploadingInfo.currentRequestIndex = 0;
    stepState.requestsToSend = [];
    let n = 0;

    for (let eq of equipmentForUploading) {
      //if (n > 0) break; //for debugging
      if (eq.type === UploadingType.Undefined || eq.examples.length < 1) continue;
      n++;
      //if(n != 3) continue; //for debugging
      let message = `<b>${eq.name}</b>\n`;
      let additionalInfo = '';
      if (eq.type === UploadingType.Ssk) {
        const addedEquipments = [];
        let sskEquipment = sskEquipments.find(e => e.name === eq.name && !addedEquipments.find(a => a === e.id));
        let equipmentIndex = 1;
        while (sskEquipment) {
          addedEquipments.push(sskEquipment.id);
          UploadFilesSceneBuilder.addRequestToState(sskEquipment.id, additionalInfo, message, stepState, eq, equipmentIndex++);
          sskEquipment = sskEquipments.find(e => e.name === eq.name && !addedEquipments.find(a => a === e.id));
        }
      }
      if (eq.type === UploadingType.All) {
        UploadFilesSceneBuilder.addRequestToState(eq.name, additionalInfo, message, stepState, eq, 1);
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
    index: number,
  ): void {
    let i = 1;
    for (let exml of equipment.examples) {
      const requestFile = new RequestFile(
        uuidv4()
          .replace('-', '')
          .substr(0, 8),
        equipmentId,
        equipment.name,
        equipment.code,
        `${message}${info}${exml.description.replace('№', '№' + index)}`,
        exml.url,
        i++,
      );
      state.uploadingInfo.requests.push(requestFile);
      state.requestsToSend.push(requestFile);
    }
  }

  private async startQuadRequestFilesForEquipment(ctx: TelegrafContext): Promise<void> {
    await this.createQuadRequestsForFiles(ctx);
    await this.sendNextRequest(ctx);
  }

  private async startYearRequestFilesForEquipment(ctx: TelegrafContext): Promise<void> {
    await this.createYearRequestsForFiles(ctx);
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
    let result = undefined;
    if (stepState.uploadType === UploadType.Year) {
      result = await this.jobsService.startYearUploadingFiles({
        files: filesForUploading,
        sessionId: sessionId,
        maintenanceId: stepState.uploadingInfo.maintenanceId,
        fromChatId: ctx.chat.id,
        engineerPersonId: stepState.user.person.id,
        sskNumber: stepState.uploadingInfo.sskNumber,
        maintenanceDate: stepState.uploadingInfo.maintenanceDate,
      });
    }
    if (stepState.uploadType === UploadType.Quad) {
      result = await this.jobsService.startQuadUploadingFiles({
        files: filesForUploading,
        sessionId: sessionId,
        maintenanceId: stepState.uploadingInfo.maintenanceId,
        fromChatId: ctx.chat.id,
        engineerPersonId: stepState.user.person.id,
        sskNumber: stepState.uploadingInfo.sskNumber,
        maintenanceDate: stepState.uploadingInfo.maintenanceDate,
      });
    }

    if (result) {
      stepState.step = UploadFilesSteps.UploadingConfirmed;
      await this.uploadFilesSessionStorageService.update(stepState);
    }
  }

  private async sendNextRequest(ctx: TelegrafContext): Promise<void> {
    const stepState = await this.getSession(ctx);

    if (!stepState) {
      await ctx.reply('Данные по загрузке не сохранились. Попробуйте отменить команду (/cancel) и загрузить ещё раз');
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
    request.confirmatorId = person.id ?? person.telegramUsername;

    const sentFile = stepState.uploadingInfo.files.find(e => e.id === requestId);

    if (sentFile) {
      sentFile.status = RequestStatus.Confirmed;
      sentFile.confirmatorId = person.id ?? person.telegramUsername;
      if(sentFile.file && sentFile.file.fileId && sentFile.file.name){
        const path = await ctx.telegram.getFileLink(sentFile.file.fileId);
        if(path){
          const pathToSave = this.configurationService.appconfig.tempFolder + uploadingInfo.sskNumber + '_' + request.code + '_' + request.index + '_' + sentFile.file.name;
          if(await this.downloadImage(path, pathToSave) == true) sentFile.file.path = pathToSave;
        } 
      }
     
    } else {
      return;
    }

    await this.uploadFilesSessionStorageService.update(stepState);

    if (handleUploadRequest.messageId) this.eventEmitter.emit(`confUplResult:${handleUploadRequest.messageId}`);
    else {
      try {
        await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('✅ Принято', 'Approved:' + sessionId + ':' + requestId)]]));
      } catch (e) {
        this.logger.error(e?.message, e);
      }
    }

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
    } else {
      return;
    }

    const requestToSend = stepState.uploadingInfo.requests.find(e => e.id === requestId);

    const newFileRequest = new RequestFile(
      requestToSend.id,
      requestToSend.equipmentId,
      requestToSend.equipmentName,
      requestToSend.code,
      requestToSend.message,
      requestToSend.photoFile,
      requestToSend.index,
    );

    stepState.requestsToSend.unshift(newFileRequest);

    if (stepState.requestsToSend.length === 1 && stepState.step === UploadFilesSteps.Completed) await this.sendNextRequest(ctx);

    stepState.step = UploadFilesSteps.Uploading;
    await this.uploadFilesSessionStorageService.update(stepState);

    if (handleUploadRequest.messageId) this.eventEmitter.emit(`rejUplResult:${handleUploadRequest.messageId}`);
    else {
      try {
        await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('❌ Отклонено', 'Rejected:' + sessionId + ':' + requestId)]]));
      } catch (e) {
        this.logger.error(e?.message, e);
      }
    }
    return true;
  }

  private async enterScene(ctx: TelegrafContext, uploadType: UploadType, message: string): Promise<void> {
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
      uploadType: uploadType,
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

    await ctx.reply(message, Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra({ parse_mode: 'HTML' }));
  }

  public async enterQuadScene(ctx: TelegrafContext): Promise<void> {
    await this.enterScene(ctx, UploadType.Quad, 'Введите <b>номер (ид)</b> квартального ТО для загрузки фото');
  }

  public async enterYearScene(ctx: TelegrafContext): Promise<void> {
    await this.enterScene(ctx, UploadType.Year, 'Введите <b>номер (ид)</b> годового ТО для загрузки фото');
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
        return;
      }

      if (stepState?.step === UploadFilesSteps.Enter) {
        if (!/^(\d+)$/g.test(ctx.message.text)) {
          await ctx.reply(
            'ТО с таким номером не найдено, введите корректный номер ТО или отмените команду',
            Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra(),
          );
          return;
        }

        stepState.uploadingInfo.maintenanceId = ctx.message.text;

        const columnParams: ColumnParam[] = [];
        const maintenanceSheet =
          stepState.uploadType === UploadType.Quad ? this.configurationService.maintenanceSheet : this.configurationService.yearMaintenanceSheet;

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
            'ТО с таким номером не найдено, введите корректный номер ТО или отмените команду',
            Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra(),
          );
          return;
        }

        let sskNumber = foundRow.values[maintenanceSheet.getColumnIndex(maintenanceSheet.sskNumberColumn)];

        if (sskNumber && sskNumber.length > 0) {
          const dateIndex = maintenanceSheet.getColumnIndex(maintenanceSheet.maintenanceDateColumn);
          stepState.uploadingInfo.sskNumber = sskNumber;
          stepState.uploadingInfo.maintenanceDate = foundRow.values[dateIndex];
          await ctx.reply(
            `Вы хотите загрузить фото для ТО для ССК-<b>${sskNumber}</b>.` + ` Дата проведения <b>${foundRow.values[dateIndex]}</b>`,
            Markup.inlineKeyboard([Markup.callbackButton('✅ Да', 'ConfirmId'), Markup.callbackButton('❌ Нет', 'RejectId')]).extra({
              parse_mode: 'HTML',
            }),
          );
          return;
        }

        stepState.step = UploadFilesSteps.Uploading;
        await this.uploadFilesSessionStorageService.update(stepState);
        if (stepState.uploadType === UploadType.Quad) await this.startQuadRequestFilesForEquipment(ctx);
        if (stepState.uploadType === UploadType.Year) await this.startYearRequestFilesForEquipment(ctx);
      }
    });

    bot.action('ConfirmId', async ctx => {
      try {
        await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('✅Да ', 'Confirmed')]]));
        const stepState = await this.getSession(ctx);
        stepState.step = UploadFilesSteps.Uploading;
        await this.uploadFilesSessionStorageService.update(stepState);
        if (stepState.uploadType === UploadType.Quad) await this.startQuadRequestFilesForEquipment(ctx);
        if (stepState.uploadType === UploadType.Year) await this.startYearRequestFilesForEquipment(ctx);
      } catch (e) {
        this.logger.error(e?.message, e);
      }
    });

    bot.action('RejectId', async ctx => {
      try {
        await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('❌Нет ', 'Rejected')]]));
        await this.enterQuadScene(ctx);
      } catch (e) {
        this.logger.error(e?.message, e);
      }
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
        await this.enterQuadScene(ctx);
      } else {
        await ctx.reply('Завершите предыдущую загрузку сообщений или отмените, нажав на команду /cancel');
      }
    });

    bot.command('year', async ctx => {
      const session = await this.getSession(ctx);

      if (
        !session ||
        session.step === UploadFilesSteps.UploadingConfirmed ||
        session.step === UploadFilesSteps.Cancelled ||
        session.step === UploadFilesSteps.Completed
      ) {
        await this.enterYearScene(ctx);
      } else {
        await ctx.reply('Завершите предыдущую загрузку сообщений или отмените, нажав на команду /cancel');
      }
    });

    bot.on('photo', async ctx => {
      const stepState = await this.getSession(ctx);

      if (
        !(stepState?.step === UploadFilesSteps.Uploading || stepState?.step === UploadFilesSteps.Completed) ||
        !ctx.message.photo ||
        ctx.message.photo.length < 1
      )
        return;

      const doc = ctx.message.photo[ctx.message.photo.length - 1];
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
              fileId: doc.file_id,
              path: ''
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
      await ctx.reply(
        'Фото принимаются только "С СЖАТИЕМ". Теперь при отправке фото НЕ НУЖНО выбирать опцию "Отправить без сжатия". При отправке с компьютера поставьте галочку "Сжать изображение"',
      );
      return;
    });
    return scene;
  }
}
