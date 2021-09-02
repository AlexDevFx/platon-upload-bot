import { Injectable } from '@nestjs/common';
import { SheetsService } from '../sheets.service';
import { ConfigurationService } from '../../config/configuration.service';
import moment = require('moment');
import { ColumnParam, CompareType, FilterOptions } from '../filterOptions';

export enum UserRoles {
    Unknown= -1,
    Engineer,
    Admin,
}

export interface IPerson {
    id: string;
    telegramUsername: string;
    fullName: string;
    role: UserRoles
}

@Injectable()
export class PersonsStore {
    private data: IPerson[];
    private updated: Date;

    constructor(private readonly sheetsService: SheetsService, private readonly configurationService: ConfigurationService) {}

    public async getPersonByUserName(username: string): Promise<IPerson>{
        const persons = await this.getPersons();
        const usernameForSearch = username.toLowerCase();
        return persons.find(e => e.telegramUsername.toLowerCase() === usernameForSearch);
    }
    
    private async getPersons(): Promise<IPerson[]> {
        const currentTime = moment()
            .utc()
            .toDate();
        if (!this.data || this.data.length < 1 || currentTime.getTime() - this.updated.getTime() >= 3600000) {
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
                const newData = [];
                for (let r of rows) {
                    const role = r.values[personsSheet.getColumnIndex(personsSheet.roleColumn)];

                    newData.push({
                        id: r.values[personsSheet.getColumnIndex(personsSheet.idColumn)],
                        role: role === 'Инженер' ? UserRoles.Engineer : role === 'Администратор' ? UserRoles.Admin : UserRoles.Unknown,
                        fullName: r.values[personsSheet.getColumnIndex(personsSheet.fullNameColumn)],
                        telegramUsername: r.values[personsSheet.getColumnIndex(personsSheet.telegramUsernameColumn)]
                    });
                }
                this.data = newData;
                this.updated = moment()
                    .utc()
                    .toDate();
            }

            this.updated = currentTime;
        }

        return this.data;
    }
}
