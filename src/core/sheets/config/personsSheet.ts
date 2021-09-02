import { SheetRange } from '../sheetRange';

interface IPersonsSheet {
    idColumn: string;
    fullNameColumn: string;
    telegramUsernameColumn: string;
    roleColumn: string;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;
}

export class PersonsSheet extends SheetRange implements IPersonsSheet {
    idColumn: string;
    fullNameColumn: string;
    telegramUsernameColumn: string;
    roleColumn: string;

    spreadSheetId: string;
    sheetName: string;
    startColumnName: string;
    endColumnName: string;
    startRow: number;
    endRow: number;

    constructor(sheet: IPersonsSheet) {
        super(sheet.spreadSheetId, sheet.sheetName, sheet.startColumnName, sheet.endColumnName, sheet.startRow, sheet.endRow);
        this.idColumn = sheet.idColumn;
        this.fullNameColumn = sheet.fullNameColumn;
        this.telegramUsernameColumn = sheet.telegramUsernameColumn;
        this.roleColumn = sheet.roleColumn;
    }
}
