import { RequestedFile } from './userUploadingInfoDto';
import { Document } from 'mongoose';

export class UserUploadingInfo extends Document {
  public readonly files: RequestedFile[];
  public readonly username: string;
  public readonly userId: number;
}
