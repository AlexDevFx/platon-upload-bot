import { SheetRange } from '../sheetRange';

interface IMaintenanceSheet {
    idColumn: string;
    sskNumberColumn: string;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;
}

export class MaintenanceSheet extends SheetRange implements IMaintenanceSheet {
    idColumn: string;
    sskNumberColumn: string;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;

    constructor(sheet: IMaintenanceSheet) {
        super(sheet.spreadSheetId, sheet.sheetName, sheet.startColumnName, sheet.endColumnName, sheet.startRow, sheet.endRow);
        this.idColumn = sheet.idColumn;
        this.sskNumberColumn = sheet.sskNumberColumn;
    }
}