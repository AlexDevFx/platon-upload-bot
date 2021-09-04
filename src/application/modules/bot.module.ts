import { Telegraf, session, Stage, Markup } from 'telegraf';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerService } from 'nest-logger';
import { LoggerModule } from './logger.module';
import { HttpModule } from '@nestjs/axios';
import { ConfigurationService } from '../../core/config/configuration.service';
import { UploadFilesSceneBuilder } from './bot-scenes/upload-files-scene-builder.service';
import { UploadedEquipmentStore } from '../../core/sheets/config/uploadedEquipmentStore';
import { SheetsService } from '../../core/sheets/sheets.service';
import { FileStorageService } from '../../core/sheets/filesStorage/file-storage.service';
import { DbStorageService } from '../../core/dataStorage/dbStorage.service';
import { JobsModule } from './jobs.module';
import { DatabaseModule } from './database.module';
import { userUploadingInfoProviders } from '../../core/dataStorage/filesUploading/userUploadingInfo.providers';
import { PersonsStore } from '../../core/sheets/config/personsStore';
import { SskEquipmentStore } from '../../core/sheets/config/sskEquipmentStore';
import { JobsService } from '../../core/jobs/jobs.service';
import { UploadFilesSceneState, UploadFilesSteps } from './bot-scenes/UploadQuadMaintenanceScene';
import { RequestStatus } from '../../core/dataStorage/filesUploading/userUploadingInfoDto';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { IAdminHandleUploadRequest } from '../../core/event/adminHandleUploadRequest';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../config/.env.development', '../config/.env.production'],
    }),
    LoggerModule,
    JobsModule,
    DatabaseModule,
    HttpModule.register({
      timeout: 30000,
    }),
    EventEmitterModule.forRoot({
      // set this to `true` to use wildcards
      wildcard: false,
      // the delimiter used to segment namespaces
      delimiter: '.',
      // set this to `true` if you want to emit the newListener event
      newListener: false,
      // set this to `true` if you want to emit the removeListener event
      removeListener: false,
      // the maximum amount of listeners that can be assigned to an event
      maxListeners: 10,
      // show event name in memory leak message when more than maximum amount of listeners is assigned
      verboseMemoryLeak: false,
      // disable throwing uncaughtException if an error event is emitted and it has no listeners
      ignoreErrors: false,
    }),
  ],
  providers: [
    UploadFilesSceneBuilder,
    ConfigurationService,
    UploadedEquipmentStore,
    SheetsService,
    FileStorageService,
    DbStorageService,
    PersonsStore,
    SskEquipmentStore,
    ...userUploadingInfoProviders,
  ],
})
export class BotModule {
  constructor(
    private readonly uploadFilesSceneBuilder: UploadFilesSceneBuilder,
    private readonly logger: LoggerService,
    private readonly jobsService: JobsService,
    private readonly dbStorageService: DbStorageService,
    private readonly personsStore: PersonsStore,
    private readonly eventEmitter: EventEmitter2,
    private readonly uploadedEquipmentStore: UploadedEquipmentStore,
  ) {
    this.init(process.env.BOT_TOKEN).then(async () => {
      this.logger.log('Bot has been started');
    });
  }

  private bot;

  private async init(botToken): Promise<void> {
    const startMessage = 'Hello From Bot!';

    const getDataTask = this.uploadedEquipmentStore.getData();

    this.bot = new Telegraf(botToken);
    this.bot.use(session());

    const uploadFilesScene = this.uploadFilesSceneBuilder.build();
    const stage = new Stage([uploadFilesScene]);
    this.bot.use(stage.middleware());

    this.bot.use(async (ctx, next) => {
      if (ctx.from.is_bot) {
        await ctx.reply('C ботами не работаем');
        return;
      }
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        await next();
        return;
      }
    });

    this.bot.catch((err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}`, err?.stack);
    });

    this.bot.command('quad', async (ctx, next) => {
      await ctx.scene.enter(this.uploadFilesSceneBuilder.SceneName);
    });

    this.bot.action(/confUpl:/, async (ctx, next) => {
      if (ctx.updateType === 'callback_query' && ctx.update?.callback_query?.data) {
        const data = ctx.update.callback_query.data.split(':');
        const sessionId = data[1];
        const requestId = data[2];
        this.eventEmitter.emit('confUpl:' + sessionId, {
          username: ctx.from.username,
          userId: ctx.from.id,
          sessionId: sessionId,
          requestId: requestId,
          messageId: ctx.update.callback_query.message.message_id,
        });

        this.eventEmitter.on(`confUplResult:${ctx.update.callback_query.message.message_id}`, async () => {
          await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('✅ Принято', 'confUpl:' + sessionId + ':' + requestId)]]));
        });
      }
    });

    this.bot.action(/rejUpl:/, async (ctx, next) => {
      if (ctx.updateType === 'callback_query' && ctx.update?.callback_query?.data) {
        const data = ctx.update.callback_query.data.split(':');
        const sessionId = data[1];
        const requestId = data[2];
        this.eventEmitter.emit('rejUpl:' + sessionId, {
          username: ctx.from.username,
          userId: ctx.from.id,
          sessionId: sessionId,
          requestId: requestId,
          messageId: ctx.update.callback_query.message.message_id,
        });
        this.eventEmitter.on(`rejUplResult:${ctx.update.callback_query.message.message_id}`, async () => {
          await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([[Markup.callbackButton('❌ Отклонено', 'rejUpl:' + sessionId + ':' + requestId)]]));
        });
      }
    });

    this.bot.start(async ctx => {
      await ctx.reply(startMessage);
    });

    this.jobsService.init(this.bot);
    const equipmentData = await getDataTask;
    return this.bot.launch();
  }
}
