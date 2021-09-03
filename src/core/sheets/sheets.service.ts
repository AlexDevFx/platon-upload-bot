import { Injectable } from '@nestjs/common';
import { google, sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as readline from 'readline';
import { LoggerService } from 'nest-logger';

const CRED_PATH = '../config/sheets-credentials.json';
const TOKEN_PATH = '../config/sheets-token.json';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
import Sheets = sheets_v4.Sheets;
import { ColumnParam, CompareType, FilterOptions, FilterParam } from './filterOptions';
import { SheetRange } from './sheetRange';

enum SearchCellType {
  First,
  Last,
  All,
}

interface SearchCellOptions {
  IsIncludeRowValue: boolean;
  SearchType: SearchCellType;
  SearchColumn: number;
}

interface Cell {
  row: number;
  column: number;
  value: any;
  rowValue: any[];
}

interface Row {
  values: any[];
  index: number;
}

@Injectable()
export class SheetsService {
  constructor(private readonly logger: LoggerService) {}

  public async init() {
    this.logger.log(`Sheet initialization completed`);
  }

  public async getSheet(): Promise<Sheets> {
    try {
      const authToken = await this.authorize();
      const sheet = google.sheets({
        version: 'v4',
        auth: authToken,
      });
      return sheet;
    } catch (e) {
      this.logger.error('Google sheet getting error', e);
    }
  }

  public async getSheetValues(spreadSheetId: string, cellsRange: string): Promise<any[][]> {
    try {
      const sheet = await this.getSheet();
      const rows = await sheet.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: cellsRange,
      });
      return rows.data.values;
    } catch (e) {
      this.logger.error('Google sheet getting cells error', e);
    }
    return undefined;
  }

  public async updateCellsValues(sheetId: string, cellsRange: string, data: any[][], valueInputOption: string = 'RAW'): Promise<boolean> {
    try {
      const sheet = await this.getSheet();
      const response = await sheet.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: cellsRange,
        valueInputOption: valueInputOption,
        requestBody: {
          values: data,
        },
      });
      return response.status === 200;
    } catch (e) {
      this.logger.error('Google sheet getting cells error', e);
    }
    return false;
  }

  public async updateBatchCellsValues(sheetId: string, rangesData: any[], valueInputOption: string = 'RAW'): Promise<boolean> {
    try {
      const sheet = await this.getSheet();
      const response = await sheet.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          data: rangesData,
          valueInputOption: valueInputOption,
        },
      });
      return response.status === 200;
    } catch (e) {
      this.logger.error('Google sheet getting cells error', e);
    }
    return false;
  }

  public async getFilteredRows(options: FilterOptions): Promise<Row[]> {
    const rows = await this.getSheetValues(options.range.spreadSheetId, options.range.getStringRange());
    const resultRows: Row[] = [];
    let rowIndex = 0;

    for (const e of rows) {
      if (this.isPassFilters(e, options)) {
        resultRows.push({
          values: e,
          index: rowIndex + options.range.startRow,
        });
      }
      rowIndex++;
    }

    return resultRows;
  }

  public async getFirstRow(options: FilterOptions): Promise<Row> {
    const rows = await this.getSheetValues(options.range.spreadSheetId, options.range.getStringRange());
    let resultRow: Row;
    let rowIndex = 0;

    if (rows === undefined) {
      return undefined;
    }

    for (const e of rows) {
      if (this.isPassFilters(e, options)) {
        resultRow = {
          values: e,
          index: rowIndex + options.range.startRow,
        };
        break;
      }
      rowIndex++;
    }

    return resultRow;
  }

  public async getNonEmptyRowIndex(sheetRange: SheetRange): Promise<number> {
    const rows = await this.getSheetValues(sheetRange.spreadSheetId, sheetRange.getStringRange());
    if (rows === undefined) {
      return -1;
    }

    return rows.length + sheetRange.startRow;
  }

  public async getLastRow(options: FilterOptions): Promise<Row> {
    const rows = await this.getFilteredRows(options);

    return rows.length > 0 ? rows[rows.length - 1] : undefined;
  }

  private isPassFilters(rowValues: any[], options: FilterOptions): boolean {
    if (options.params.length < 1) return true;
    let result = true;
    for (const p of options.params) {
      const columnIndex = options.range.getColumnIndex(p.column);
      if (!this.isValidCellValue(rowValues[columnIndex], p)) {
        result = false;
        break;
      }
    }

    return result;
  }

  private isValidCellValue(value: any, param: FilterParam): boolean {
    switch (param.type) {
      case CompareType.Contains:
        return value.toString().indexOf(param.value.toString()) >= 0;
      case CompareType.Equal:
        return value === param.value;
      case CompareType.NotEqual:
        return value !== param.value;
      case CompareType.IsEmpty:
        return value === undefined || value === '' || value == null;
      case CompareType.IsNotEmpty:
        return value !== undefined && value !== '' && value != null;
      case CompareType.Predicate:
        return param.predicate(value);
    }
    return false;
  }

  private async authorize() {
    try {
      const cred = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
      const { client_secret, client_id, redirect_uris } = cred.installed;
      const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      if (fs.existsSync(TOKEN_PATH)) {
        oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
        return oAuth2Client;
      }
      return this.getNewToken(oAuth2Client);
    } catch (e) {
      this.logger.error('Google authorization error', e);
    }
  }

  private async getNewToken(oAuth2Client: OAuth2Client): Promise<OAuth2Client> {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    this.logger.log(`Authorize this app by visiting this url: ${authUrl}`);

    return (await new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('Enter the code from that page here: ', code => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
          reject(err);
          if (!token) {
            reject();
          }
          oAuth2Client.setCredentials(token!);

          fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));

          resolve(oAuth2Client);
        });
      });
    })) as OAuth2Client;
  }
}
