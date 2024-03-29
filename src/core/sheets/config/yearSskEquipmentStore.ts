import { CacheDataStore } from './cachedDataStore';
import { SheetsService } from '../sheets.service';
import { ConfigurationService } from '../../config/configuration.service';
import { ColumnParam, CompareType, FilterOptions } from '../filterOptions';
import { Injectable } from '@nestjs/common';

interface IAdditionalInfo {
  name: string;
  value: string;
}

interface ISskEquipment {
  id: string;
  name: string;
  sskNumber: string;
  type: string;
  rowNumber: string;
  additionalInfo: IAdditionalInfo[];
}

@Injectable()
export class YearSskEquipmentStore extends CacheDataStore<ISskEquipment> {
  constructor(private readonly sheetsService: SheetsService, private readonly configurationService: ConfigurationService) {
    super();
    this.updateTimeOut = 4 * 3600000;
  }

  protected async loadData(): Promise<void> {
    const equipmentSheet = this.configurationService.yearEquipmentSheet;
    const columnParams: ColumnParam[] = [];

    columnParams.push({
      column: equipmentSheet.idColumn,
      type: CompareType.IsNotEmpty,
      value: '',
    });
    const filterOptions: FilterOptions = {
      params: columnParams,
      range: equipmentSheet,
    };

    const rows = await this.sheetsService.getFilteredRows(filterOptions);
    const equipmentNameIndex = equipmentSheet.getColumnIndex(equipmentSheet.equipmentNameColumn);
    const sskNumberIndex = equipmentSheet.getColumnIndex(equipmentSheet.sskNumberColumn);
    const idIndex = equipmentSheet.getColumnIndex(equipmentSheet.idColumn);
    const typeIndex = equipmentSheet.getColumnIndex(equipmentSheet.typeColumn);
    const rowIndex = equipmentSheet.getColumnIndex(equipmentSheet.rowNumberColumn);

    const additionalColumns = [
      { index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber1Column), name: 'Серийный №1' },
      { index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber2Column), name: 'Серийный №2' },
      { index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber3Column), name: 'Серийный №3' },
      { index: rowIndex, name: 'Полоса' },
      { index: equipmentSheet.getColumnIndex(equipmentSheet.modelNameColumn), name: 'Модель' },
      { index: equipmentSheet.getColumnIndex(equipmentSheet.typeColumn), name: 'Тип' },
    ];

    if (rows) {
      const newData: ISskEquipment[] = [];
      for (let r of rows) {
        const info: IAdditionalInfo[] = [];

        for (let col of additionalColumns) {
          info.push({
            name: col.name,
            value: r.values[col.index],
          });
        }
        newData.push({
          id: r.values[idIndex],
          name: r.values[equipmentNameIndex],
          sskNumber: r.values[sskNumberIndex],
          type: r.values[typeIndex],
          rowNumber: r.values[rowIndex],
          additionalInfo: info,
        });
      }
      this.data = newData;
    }
  }
}
