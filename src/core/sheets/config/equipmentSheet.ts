import { SheetRange } from '../sheetRange';

interface IEquipmentSheet {
  idColumn: string;
  sskNumberColumn: string;
  equipmentNameColumn: string;
  serialNumber1Column: string;
  serialNumber2Column: string;
  serialNumber3Column: string;
  rowNumberColumn: string;
  modelNameColumn: string;
  typeColumn: string;
  
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
  serialNumber1Column: string;
  serialNumber2Column: string;
  serialNumber3Column: string;
  rowNumberColumn: string;
  modelNameColumn: string;
  typeColumn: string;

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
    this.serialNumber1Column = sheet.serialNumber1Column;
    this.serialNumber2Column = sheet.serialNumber2Column;
    this.serialNumber3Column = sheet.serialNumber3Column;
    this.rowNumberColumn = sheet.rowNumberColumn;
    this.modelNameColumn = sheet.modelNameColumn;
    this.typeColumn = sheet.typeColumn;
  }
}
