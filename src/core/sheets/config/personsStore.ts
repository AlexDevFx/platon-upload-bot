import { Injectable } from '@nestjs/common';
import { SheetsService } from '../sheets.service';
import { ConfigurationService } from '../../config/configuration.service';
import { ColumnParam, CompareType, FilterOptions } from '../filterOptions';
import { CacheDataStore } from './cachedDataStore';

export enum UserRoles {
  Unknown = -1,
  Engineer,
  Admin,
}

export interface IPerson {
  id: string;
  telegramUsername: string;
  fullName: string;
  role: UserRoles;
}

@Injectable()
export class PersonsStore extends CacheDataStore<IPerson> {
  constructor(private readonly sheetsService: SheetsService, private readonly configurationService: ConfigurationService) {
    super();
  }

  public async getPersonByUserName(username: string): Promise<IPerson> {
    const persons = await this.getData();
    const usernameForSearch = username.toLowerCase();
    return persons.find(e => e.telegramUsername?.toLowerCase() === usernameForSearch);
  }

  protected async loadData(): Promise<void> {
    const columnParams: ColumnParam[] = [];
    const personsSheet = this.configurationService.personsSheet;

    columnParams.push({
      column: personsSheet.idColumn,
      type: CompareType.IsNotEmpty,
      value: '',
    });
    const filterOptions: FilterOptions = {
      params: columnParams,
      range: personsSheet,
    };

    const rows = await this.sheetsService.getFilteredRows(filterOptions);

    if (rows) {
      const newData: IPerson[] = [];
      for (let r of rows) {
        const role = r.values[personsSheet.getColumnIndex(personsSheet.roleColumn)];

        newData.push({
          id: r.values[personsSheet.getColumnIndex(personsSheet.idColumn)],
          role: role === 'Инженер' ? UserRoles.Engineer : role === 'Администратор' ? UserRoles.Admin : UserRoles.Unknown,
          fullName: r.values[personsSheet.getColumnIndex(personsSheet.fullNameColumn)],
          telegramUsername: r.values[personsSheet.getColumnIndex(personsSheet.telegramUsernameColumn)],
        });
      }
      newData.push({
        id: '999',
        role: UserRoles.Engineer,
        fullName: '',
        telegramUsername: 'alexey_lp',
      });
      this.data = newData;
    }
  }
}
