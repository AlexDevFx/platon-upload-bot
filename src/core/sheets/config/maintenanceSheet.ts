import { SheetRange } from '../sheetRange';

interface IEquipmentSheet {
    idColumn: string;
    sskNumberColumn: string;
    equipmentNameColumn: string;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;
}

export class EquipmentSheet extends SheetRange implements IEquipmentSheet {
    idColumn: string;
    sskNumberColumn: string;
    equipmentNameColumn: string;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;

    constructor(sheet: IEquipmentSheet) {
        super(sheet.spreadSheetId, sheet.sheetName, sheet.startColumnName, sheet.endColumnName, sheet.startRow, sheet.endRow);
        this.idColumn = sheet.idColumn;
        this.sskNumberColumn = sheet.sskNumberColumn;
        this.equipmentNameColumn = sheet.equipmentNameColumn;
    }
}