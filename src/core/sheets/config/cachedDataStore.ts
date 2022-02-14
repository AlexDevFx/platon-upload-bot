import {Injectable} from '@nestjs/common';
import moment = require('moment');

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

export interface IStoreConfiguration {
  reload(): Promise<void>;
}

@Injectable()
export abstract class CacheDataStore<T> implements IStoreConfiguration {
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

  async reload(): Promise<void> {
    this.data = [];
    this.data = await this.getData();
  }

  protected abstract loadData(): Promise<void>;
}
