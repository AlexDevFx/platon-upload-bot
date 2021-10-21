import { SheetRange } from '../sheetRange';

interface IYearMaintenanceUploadingSheet {
    maintenanceIdColumn: string;
    fieldCodeColumn: string;
    equipmentIdColumn: string;
    engineerIdColumn: string;
    confirmatoryIdColumn: string;
    photoStartColumn: string;
    photoEndColumn: string;
    requestedFieldCodeColumn: string;
    equipmentRequestedNameColumn: string;
    equipmentPhotosTypeColumn: string;
    equipmentPhotosPrefixColumn: string;
    equipmentPhotosStartColumn: string;
    equipmentPhotosCount: number;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;
}

export class YearMaintenanceUploadingSheet extends SheetRange implements IYearMaintenanceUploadingSheet {
    maintenanceIdColumn: string;
    fieldCodeColumn: string;
    equipmentIdColumn: string;
    engineerIdColumn: string;
    confirmatoryIdColumn: string;
    photoStartColumn: string;
    photoEndColumn: string;
    requestedFieldCodeColumn: string;
    equipmentRequestedNameColumn: string;
    equipmentPhotosTypeColumn: string;
    equipmentPhotosPrefixColumn: string;
    equipmentPhotosStartColumn: string;
    equipmentPhotosCount: number;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;

    constructor(sheet: IYearMaintenanceUploadingSheet) {
        super(sheet.spreadSheetId, sheet.sheetName, sheet.startColumnName, sheet.endColumnName, sheet.startRow, sheet.endRow);
        this.maintenanceIdColumn = sheet.maintenanceIdColumn;
        this.fieldCodeColumn = sheet.fieldCodeColumn;
        this.equipmentIdColumn = sheet.equipmentIdColumn;
        this.engineerIdColumn = sheet.engineerIdColumn;
        this.confirmatoryIdColumn = sheet.confirmatoryIdColumn;
        this.photoStartColumn = sheet.photoStartColumn;
        this.photoEndColumn = sheet.photoEndColumn;
        this.requestedFieldCodeColumn = sheet.requestedFieldCodeColumn;
        this.equipmentRequestedNameColumn = sheet.equipmentRequestedNameColumn;
        this.equipmentPhotosTypeColumn = sheet.equipmentPhotosTypeColumn;
        this.equipmentPhotosPrefixColumn = sheet.equipmentPhotosPrefixColumn;
        this.equipmentPhotosStartColumn = sheet.equipmentPhotosStartColumn;
        this.equipmentPhotosCount = sheet.equipmentPhotosCount;
    }
}
