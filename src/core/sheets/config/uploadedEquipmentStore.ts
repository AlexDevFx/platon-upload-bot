import { Injectable } from '@nestjs/common';
import { SheetsService } from '../sheets.service';
import { ConfigurationService } from '../../config/configuration.service';
import { ColumnParam, CompareType, FilterOptions } from '../filterOptions';
import { CacheDataStore } from './cachedDataStore';

export interface IPhotoExample {
  url: string;
  description: string;
}

export enum UploadingType {
  Undefined = -1,
  Ssk,
  All,
}

export interface IUploadedEquipment {
  name: string;
  type: UploadingType;
  examples: IPhotoExample[];
}

@Injectable()
export class UploadedEquipmentStore extends CacheDataStore<IUploadedEquipment> {
  constructor(private readonly sheetsService: SheetsService, private readonly configurationService: ConfigurationService) {
    super();
  }

  protected async loadData(): Promise<void> {
    const columnParams: ColumnParam[] = [];
    const maintenanceUploadingSheet = this.configurationService.maintenanceUploadingSheet;

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

        const startPhotoIndex = maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentPhotosStartColumn);
        const endPhotoIndex = startPhotoIndex + maintenanceUploadingSheet.equipmentPhotosCount * 2;
        const examples = [];
        for (let i = startPhotoIndex; i < endPhotoIndex; i += 2) {
          if (r.values[i] && /^https:\/\/drive/g.test(r.values[i])) {
            examples.push({
              url: r.values[i],
              description: r.values[i + 1],
            });
          }
        }

        uploadedEquipment.push({
          name: r.values[maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentRequestedNameColumn)],
          type: type === 'ССК' ? UploadingType.Ssk : type === 'Все' ? UploadingType.All : UploadingType.Undefined,
          examples: examples,
        });
      }
      this.data = uploadedEquipment;
    }
  }
}
