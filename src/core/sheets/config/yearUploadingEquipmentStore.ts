import { Injectable } from '@nestjs/common';
import { SheetsService } from '../sheets.service';
import { ConfigurationService } from '../../config/configuration.service';
import { ColumnParam, CompareType, FilterOptions } from '../filterOptions';
import { CacheDataStore } from './cachedDataStore';
import { FileStorageService } from '../filesStorage/file-storage.service';
import * as fs from 'fs';
import { IUploadedEquipment, UploadingType } from "./uploadedEquipmentStore";

@Injectable()
export class YearUploadingEquipmentStore extends CacheDataStore<IUploadedEquipment> {
    constructor(
        private readonly sheetsService: SheetsService,
        private readonly configurationService: ConfigurationService,
        private readonly fileStorageService: FileStorageService,
    ) {
        super();
        this.updateTimeOut = 6 * 3600000;
    }

    protected async loadData(): Promise<void> {
        const columnParams: ColumnParam[] = [];
        const maintenanceUploadingSheet = this.configurationService.yearMaintenanceUploadingSheet;

        columnParams.push({
            column: maintenanceUploadingSheet.equipmentRequestedNameColumn,
            type: CompareType.IsNotEmpty,
            value: '',
        });
        const filterOptions: FilterOptions = {
            params: columnParams,
            range: maintenanceUploadingSheet,
        };

        const rows = await this.sheetsService.getFilteredRows(filterOptions);
        if (rows) {
            const uploadedEquipment: IUploadedEquipment[] = [];
            for (let r of rows) {
                const type = r.values[maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentPhotosTypeColumn)];
                const prefix = r.values[maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentPhotosPrefixColumn)];
                const startPhotoIndex = maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentPhotosStartColumn);
                const endPhotoIndex = startPhotoIndex + maintenanceUploadingSheet.equipmentPhotosCount * 2;
                const examples = [];
                for (let i = startPhotoIndex; i < endPhotoIndex; i += 2) {
                    if (r.values[i] && /^https:\/\/drive/g.test(r.values[i])) {
                        const matches = /d\/[A-Za-z0-9_-]+\/view/g.exec(r.values[i]);
                        const fileId = matches[0]?.split('/')[1];
                        let filePath = r.values[i];
                        if (fileId) {
                            if (!fs.existsSync(fileId)) await this.fileStorageService.download(fileId, fileId);
                            filePath = fileId;
                        }

                        examples.push({
                            url: filePath,
                            description: `${prefix}\n${r.values[i + 1]}`,
                        });
                    }
                }

                uploadedEquipment.push({
                    name: r.values[maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentRequestedNameColumn)],
                    code: r.values[maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.requestedFieldCodeColumn)],
                    type: type === 'ССК' ? UploadingType.Ssk : type === 'Все' ? UploadingType.All : UploadingType.Undefined,
                    examples: examples,
                });
            }
            this.data = uploadedEquipment;
        }
    }
}
