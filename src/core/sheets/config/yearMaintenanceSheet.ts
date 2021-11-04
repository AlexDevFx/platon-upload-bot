import { SheetRange } from '../sheetRange';

interface IYearMaintenanceSheet {
  idColumn: string;
  sskNumberColumn: string;
  maintenanceDateColumn: string;

  spreadSheetId: string;
  sheetName: string;
  startColumnName: string;
  endColumnName: string;
  startRow: number;
  endRow: number;
}

export class YearMaintenanceSheet extends SheetRange implements IYearMaintenanceSheet {
  idColumn: string;
  sskNumberColumn: string;
  maintenanceDateColumn: string;

  spreadSheetId: string;
  sheetName: string;
  startColumnName: string;
  endColumnName: string;
  startRow: number;
  endRow: number;

  constructor(sheet: IYearMaintenanceSheet) {
    super(sheet.spreadSheetId, sheet.sheetName, sheet.startColumnName, sheet.endColumnName, sheet.startRow, sheet.endRow);
    this.idColumn = sheet.idColumn;
    this.sskNumberColumn = sheet.sskNumberColumn;
    this.maintenanceDateColumn = sheet.maintenanceDateColumn;
  }
}
