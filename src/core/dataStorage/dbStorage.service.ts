import { Inject, Injectable } from '@nestjs/common';
import { UserUploadingInfo } from './filesUploading/UserUploadingInfo.model';
import { Model } from 'mongoose';
import { UserUploadingInfoDto } from './filesUploading/userUploadingInfoDto';

@Injectable()
export class DbStorageService {
  constructor(
    @Inject('USERUPLOADINGINFO_MODEL')
    private uploadingInfoModel: Model<UserUploadingInfo>,
  ) {}

  public async insert(data: UserUploadingInfoDto): Promise<string> {
    const createdData = new this.uploadingInfoModel(data);
    const userUploadingInfo = await createdData.save();
    return userUploadingInfo._id.toString();
  }

  public async findBy(id: string): Promise<UserUploadingInfo> {
    return await this.uploadingInfoModel.findById(id).exec();
  }

  public async update(data: UserUploadingInfo): Promise<boolean> {
    data.isNew = false;
    const userUploadingInfo = await data.save();
    return userUploadingInfo !== undefined;
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.uploadingInfoModel.deleteOne({ id: id }).exec();
    return result.deletedCount > 0;
  }
}
