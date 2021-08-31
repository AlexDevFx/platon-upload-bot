import {Injectable} from "@nestjs/common";
import {SheetsService} from "../sheets.service";
import {ConfigurationService} from "../../config/configuration.service";
import moment = require("moment");
import {ColumnParam, CompareType, FilterOptions} from "../filterOptions";

export interface IPhotoExample {
    url: string;
    description: string;
}

export enum UploadingType {
    Undefined = -1,
    Ssk,
    All
}

export interface IUploadedEquipment {
    name: string;
    type: string;
    examples: IPhotoExample[]
}

@Injectable()
export class UploadedEquipmentStore {
    private equipment: IUploadedEquipment[];
    private updated: Date;
    
    constructor(private readonly sheetsService: SheetsService,
                private readonly configurationService: ConfigurationService) {
    }
    
    public async GetEquipment(): Promise<IUploadedEquipment[]> {
        const currentTime = moment().utc().toDate();
        if(this.equipment.length < 1 || (currentTime.getTime() - this.updated.getTime()) >= 3600000){
            const columnParams: ColumnParam[] = [];
            const maintenanceUploadingSheet = this.configurationService.maintenanceUploadingSheet;

            columnParams.push({
                column: maintenanceUploadingSheet.equipmentNameColumn,
                type: CompareType.IsNotEmpty,
                value: ''
            });
            const filterOptions: FilterOptions = {
                params: columnParams,
                range: maintenanceUploadingSheet,
            };
            
            
            const rows = await this.sheetsService.getFilteredRows(filterOptions);
            
            if(rows){
                const uploadedEquipment = [];
                for(let r of rows){
                    const type = r.values[maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentPhotosType)];
                    
                    
                    uploadedEquipment.push({
                        name: r.values[maintenanceUploadingSheet.getColumnIndex(maintenanceUploadingSheet.equipmentNameColumn)],
                        type: type === 'ССК' ? UploadingType.Ssk: type === 'Все' ? UploadingType.All: UploadingType.Undefined
                    });
                }
                this.equipment = uploadedEquipment;
            }
            
            this.updated = currentTime;
        }
        
        return this.equipment;
    }
}