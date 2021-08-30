import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import {BaseScene, Stage} from "telegraf";
import {SceneContextMessageUpdate} from "telegraf/typings/stage";
import * as fs from 'fs';
import moment = require('moment');
import { LoggerService } from 'nest-logger';
import {FileStorageService, IUploadResult} from "../../../core/sheets/filesStorage/file-storage.service";
import {SheetsService} from "../../../core/sheets/sheets.service";
import {ConfigurationService} from "../../../core/config/configuration.service";
import {UploadedFile, UploadingFilesInfo} from "../../../core/sheets/filesUploading/uploadingFilesInfo";
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
    uploadingInfo: UploadingFilesInfo;
    step: UploadFilesSteps;
}


@Injectable()
export class UploadFilesScene {
    readonly SceneName: string = 'upload-files';

    constructor(
        private readonly httpService: HttpService,
        private readonly logger: LoggerService,
        private readonly fileStorageService: FileStorageService,
        private readonly sheetsService: SheetsService,
        private readonly configurationService: ConfigurationService
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

    private async uploadFile(file: UploadedFile, ctx: SceneContextMessageUpdate): Promise<void> {
        const stepState = ctx.scene.state as UploadFilesSceneState;

        if (!file) {
            await ctx.reply('Нет загруженного файла');
            return;
        }

        const result = await this.createAndShareFolder(stepState.uploadingInfo.sskNumber, ctx);
        await this.downloadImage(file.url, file.name);
        await this.fileStorageService.upload(file.name, file.size, result.fileId, null);

        if(!stepState.uploadingInfo.folderUrl){
            stepState.uploadingInfo.folderUrl = result.fileUrl;
        }
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
    
    public build(): BaseScene<SceneContextMessageUpdate> {
        const scene = new BaseScene(this.SceneName);

        scene.enter(async ctx => {
            ctx.scene.state = {
                user: {
                    telegramId: ctx.from.id,
                },
                step: 'PersonalNumber',
            };

            await ctx.reply('Please, enter activation code (digits only):');
        });

        scene.leave(async (ctx, next) => {
            const stepState = ctx.scene.state as UploadFilesSceneState;
            if (stepState.step === UploadFilesSteps.Enter) {
                await next();
                return;
            }
            leave();
        });

        scene.command('cancel', async ctx => {
            const stepState = ctx.scene.state as UploadFilesSceneState;
            stepState.step = UploadFilesSteps.Cancelled;
            await ctx.scene.leave();
        });

        return scene;
    }
}