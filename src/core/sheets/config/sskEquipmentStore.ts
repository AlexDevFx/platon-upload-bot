import {CacheDataStore} from "./cachedDataStore";
import {SheetsService} from "../sheets.service";
import {ConfigurationService} from "../../config/configuration.service";
import {ColumnParam, CompareType, FilterOptions} from "../filterOptions";
import {Injectable} from "@nestjs/common";

interface IAdditionalInfo {
    name: string;
    value: string;
}

interface ISskEquipment {
    id: string;
    name: string;
    sskNumber: string;
    additionalInfo: IAdditionalInfo[];
}

@Injectable()
export class SskEquipmentStore extends CacheDataStore<ISskEquipment>{
    constructor(private readonly sheetsService: SheetsService, private readonly configurationService: ConfigurationService) {
        super();
        this.updateTimeOut = 1800000;
    }
    
    protected async loadData(): Promise<void> {
        const equipmentSheet = this.configurationService.equipmentSheet;
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

        const additionalColumns = [
            { index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber1Column), name: 'Серийный №1' },
            { index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber2Column), name: 'Серийный №2' },
            { index: equipmentSheet.getColumnIndex(equipmentSheet.serialNumber3Column), name: 'Серийный №3' },
            { index: equipmentSheet.getColumnIndex(equipmentSheet.rowNumberColumn), name: 'Полоса' },
            { index: equipmentSheet.getColumnIndex(equipmentSheet.modelNameColumn), name: 'Модель' },
            { index: equipmentSheet.getColumnIndex(equipmentSheet.typeColumn), name: 'Тип' },
        ];
        
        if (rows) {
            const newData: ISskEquipment[] = [];
            for (let r of rows) {
                const info: IAdditionalInfo[] = [];

                for(let col of additionalColumns){
                    info.push({
                        name: col.name,
                        value: r.values[col.index]
                    })
                }
                newData.push({
                    id: r.values[idIndex],
                    name: r.values[equipmentNameIndex],
                    sskNumber: r.values[sskNumberIndex],
                    additionalInfo: info
                });
            }
            this.data = newData;
        }
    }
}