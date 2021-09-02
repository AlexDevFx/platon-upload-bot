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

  public async insert(data: UserUploadingInfoDto): Promise<boolean> {
    //const createdData = new this.uploadingInfoModel(data);
    //const userUploadingInfo = await createdData.save();
    return true;//userUploadingInfo !== undefined;
  }

  public async find(id: string): Promise<UserUploadingInfo> {
    //const data = await this.uploadingInfoModel.findOne({ id: id }).exec();
    return new UserUploadingInfo();//data;
  }

  public async update(data: UserUploadingInfo): Promise<boolean> {
    //data.isNew = false;
    //const userUploadingInfo = await data.save();
    return true;//userUploadingInfo !== undefined;
  }

  public async delete(id: string): Promise<boolean> {
    //const result = await this.uploadingInfoModel.deleteOne({ id: id }).exec();
    return true;// result.deletedCount > 0;
  }
}
