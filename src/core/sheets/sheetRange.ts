import { LettersUtils } from '../utils/lettersUtils';

export class SheetRange {
  public spreadSheetId: string;
  public sheetName: string;
  public startColumnName: string;
  public endColumnName: string;
  public startRow: number;
  public endRow: number;

  private startColumnIndex(): number {
    return LettersUtils.getLetterIndex(this.startColumnName);
  }

  private endColumnIndex(): number {
    return LettersUtils.getLetterIndex(this.endColumnName);
  }

  public getStringRange(): string {
    const startRowIndex = Math.max(1, Math.min(this.startRow, this.endRow));
    const endRowIndex = Math.max(1, Math.max(this.startRow, this.endRow));
    return `${this.sheetName}!${this.startColumnName}${startRowIndex}:${this.endColumnName}${endRowIndex}`;
  }

  public getColumnIndex(column: string): number {
    const startIndex = this.startColumnIndex();
    const maxIndex = this.endColumnIndex();
    return Math.min(maxIndex, Math.max(0, LettersUtils.getLetterIndex(column) - startIndex));
  }

  public getCellRange(cellColumn: string, cellRow: number): string {
    return `${this.sheetName}!${cellColumn}${cellRow}`;
  }

  public getRange(startColumn: string, endColumn: string, row: number): string {
    return `${this.sheetName}!${startColumn}${row}:${endColumn}${row}`;
  }

  constructor(spreadSheetId: string, sheetName: string, startColumnName: string, endColumnName: string, startRow: number, endRow: number) {
    this.spreadSheetId = spreadSheetId;
    this.sheetName = sheetName;
    this.startColumnName = startColumnName;
    this.endColumnName = endColumnName;
    this.startRow = startRow;
    this.endRow = endRow;
  }
}
