import { Telegraf, session, Stage } from 'telegraf';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerService } from 'nest-logger';
import { LoggerModule } from './logger.module';
import { ConfigurationService } from '../../core/config/configuration.service';
import {UploadFilesSceneBuilder} from "./bot-scenes/upload-files-scene-builder.service";
import {UploadedEquipmentStore} from "../../core/sheets/config/uploadedEquipmentStore";
import {SheetsService} from "../../core/sheets/sheets.service";
import {FileStorageService} from "../../core/sheets/filesStorage/file-storage.service";
import {DbStorageService} from "../../core/dataStorage/dbStorage.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['../config/.env.development', '../config/.env.production'],
    }),
    LoggerModule,
  ],
  providers: [UploadFilesSceneBuilder, ConfigurationService, UploadedEquipmentStore, SheetsService, FileStorageService, DbStorageService],
})
export class BotModule {
  constructor(
    private readonly uploadFilesSceneBuilder: UploadFilesSceneBuilder,
    private readonly logger: LoggerService,
    private readonly configurationService: ConfigurationService,
  ) {
    this.init(process.env.BOT_TOKEN).then(async () => {
      this.logger.log('Bot has been started');
      this.logger.log(`DB Connection: ${configurationService.appconfig.dbConnectionString}`);
    });
  }

  private bot;

  private init(botToken): Promise<void> {
    const startMessage = 'Hello From Bot!';

    this.bot = new Telegraf(botToken);

    const uploadFilesScene = this.uploadFilesSceneBuilder.build();
    const stage = new Stage([uploadFilesScene]);
    this.bot.use(stage.middleware());
    this.bot.use(session());

    this.bot.catch((err, ctx) => {
      this.logger.error(`Error for ${ctx.updateType}`, err?.stack);
    });

    this.bot.command('quad', async (ctx, next) => {
      await ctx.scene.enter(this.uploadFilesSceneBuilder.SceneName);
    });

    this.bot.start(async ctx => {
      await ctx.reply(startMessage);
    });

    return this.bot.launch();
  }
}
