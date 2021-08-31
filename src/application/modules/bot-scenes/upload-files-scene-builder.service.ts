import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import {BaseScene, Markup, Stage} from "telegraf";
import {SceneContextMessageUpdate} from "telegraf/typings/stage";
import * as fs from 'fs';
import moment = require('moment');
import { LoggerService } from 'nest-logger';
import {FileStorageService, IUploadResult} from "../../../core/sheets/filesStorage/file-storage.service";
import {SheetsService} from "../../../core/sheets/sheets.service";
import {ConfigurationService} from "../../../core/config/configuration.service";
import {UploadedFile, UploadingFilesInfo} from "../../../core/sheets/filesUploading/uploadingFilesInfo";
import {CallbackButton} from "telegraf/typings/markup";
import {ColumnParam, CompareType, FilterOptions} from "../../../core/sheets/filterOptions";
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
    maintenanceId: number;
}


@Injectable()
export class UploadFilesSceneBuilder {
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
    
    public build(): BaseScene<SceneContextMessageUpdate> {
        const scene = new BaseScene(this.SceneName);

        scene.enter(async ctx => {
            ctx.scene.state = {
                user: {
                    telegramId: ctx.from.id,
                },
                step: UploadFilesSteps.Enter,
                uploadingInfo: new UploadingFilesInfo()
            };
            await ctx.reply('Введите <b>номер (ид)</b> квартального ТО для загрузки фото', 
                Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra({ parse_mode: 'HTML' }));
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
                    await ctx.reply('Квартальное ТО с таким номером не найдено, введите корректный номер ТО или отмените команду',
                        Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra());
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
                if(!foundRow){
                    await ctx.reply('Квартальное ТО с таким номером не найдено, введите корректный номер ТО или отмените команду',
                        Markup.inlineKeyboard([Markup.callbackButton('Отмена', 'Cancel')]).extra());
                    return;
                }

                let sskNumber = foundRow.values[maintenanceSheet.getColumnIndex(maintenanceSheet.sskNumberColumn)];
                if(sskNumber && sskNumber.length > 0){
                    await ctx.reply(`Вы хотите загрузить фото для Квартального ТО для ССК-<b>${sskNumber}</b>.`+ 
                        + `Дата проведения <b>${foundRow.values[maintenanceSheet.getColumnIndex(maintenanceSheet.maintenanceDateColumn)]}</b>`,
                        Markup.inlineKeyboard([Markup.callbackButton('Да', 'ConfirmId'),
                            Markup.callbackButton('Нет', 'RejectId')]).extra({ parse_mode: 'HTML' }));
                    return;
                }

                stepState.step = UploadFilesSteps.Uploading;
            }
        });

        scene.action('ConfirmId', async ctx => {
            const stepState = ctx.scene.state as UploadFilesSceneState;
            stepState.step = UploadFilesSteps.Uploading;
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

        return scene;
    }
}