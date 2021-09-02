import { RequestedFile } from './userUploadingInfoDto';
import { Document } from 'mongoose';

export class UserUploadingInfo extends Document {
  public readonly files: RequestedFile[];
  public readonly id: string;
  public readonly username: string;
}
