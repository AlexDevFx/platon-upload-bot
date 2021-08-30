import { SheetRange } from '../sheetRange';

interface IMaintenanceUploadingSheet {
    idColumn: string;
    sskNumberColumn: string;
    equipmentNameColumn: string;
    engineerIdColumn: string;
    confirmatoryIdColumn: string;
    photoStartColumn: string;
    photoEndColumn: string;
    equipmentRequestedNameColumn: string;
    equipmentPhotosType: string;
    equipmentPhotosCount: number;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;
}

export class MaintenanceUploadingSheet extends SheetRange implements IMaintenanceUploadingSheet {
    idColumn: string;
    sskNumberColumn: string;
    equipmentNameColumn: string;
    engineerIdColumn: string;
    confirmatoryIdColumn: string;
    photoStartColumn: string;
    photoEndColumn: string;
    equipmentRequestedNameColumn: string;
    equipmentPhotosType: string;
    equipmentPhotosCount: number;
    
    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;

    constructor(sheet: IMaintenanceUploadingSheet) {
        super(sheet.spreadSheetId, sheet.sheetName, sheet.startColumnName, sheet.endColumnName, sheet.startRow, sheet.endRow);
        this.idColumn = sheet.idColumn;
        this.sskNumberColumn = sheet.sskNumberColumn;
        this.equipmentNameColumn = sheet.equipmentNameColumn;
        this.engineerIdColumn = sheet.engineerIdColumn;
        this.confirmatoryIdColumn = sheet.confirmatoryIdColumn;
        this.photoStartColumn = sheet.photoStartColumn;
        this.photoEndColumn = sheet.photoEndColumn;
        this.equipmentRequestedNameColumn = sheet.equipmentRequestedNameColumn;
        this.equipmentPhotosType = sheet.equipmentPhotosType;
        this.equipmentPhotosCount = sheet.equipmentPhotosCount;
    }
}