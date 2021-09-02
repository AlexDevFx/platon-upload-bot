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
export abstract class CacheDataStore<T> {
    protected data: T[];
    private updated: Date;
    protected updateTimeOut = 3600000;

    public async getData(): Promise<T[]> {
        const currentTime = moment()
            .utc()
            .toDate();
        if (!this.data || this.data.length < 1 || currentTime.getTime() - this.updated.getTime() >= this.updateTimeOut) {
            await this.loadData();
            this.updated = currentTime;
        }

        return this.data;
    }
    
    protected abstract loadData(): Promise<void>;
}