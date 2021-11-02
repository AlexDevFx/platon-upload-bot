import { Inject, Injectable } from '@nestjs/common';
import { UserUploadingInfo } from '../filesUploading/UserUploadingInfo.model';
import { Model } from 'mongoose';
import { UserUploadingInfoDto } from '../filesUploading/userUploadingInfoDto';
import { Mutex } from 'async-mutex';
import { LoggerService } from 'nest-logger';

@Injectable()
export class DbStorageService {
  constructor(
    @Inject('USERUPLOADINGINFO_MODEL')
    private uploadingInfoModel: Model<UserUploadingInfo>,
    private logger: LoggerService,
  ) {}

  mutex = new Mutex();

  public async insert(data: UserUploadingInfoDto): Promise<string> {
    const createdData = new this.uploadingInfoModel(data);
    const userUploadingInfo = await createdData.save();

    return userUploadingInfo._id.toString();
  }

  public async findBySessionId(sessionId: string): Promise<UserUploadingInfo> {
    return await this.uploadingInfoModel.findOne({ sessionId: sessionId }).exec();
  }

  public async findOne(id: string): Promise<UserUploadingInfo> {
    return await this.uploadingInfoModel.findById(id).exec();
  }

  public async update(data: UserUploadingInfo): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      data.isNew = false;
      const userUploadingInfo = await data.save();
      return userUploadingInfo !== undefined;
    } catch (e) {
      this.logger.error(e.message);
    } finally {
      release();
    }
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.uploadingInfoModel.deleteOne({ id: id }).exec();
    return result.deletedCount > 0;
  }
}
