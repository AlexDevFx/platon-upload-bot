import { IPerson } from '../../../sheets/config/personsStore';
import { RequestFile, UploadingFilesInfo } from '../../../sheets/filesUploading/uploadingFilesInfo';
import { UploadFilesSteps } from '../../../../application/modules/bot-scenes/UploadQuadMaintenanceScene';
import { Document } from 'mongoose';

export enum UploadType {
  Quad,
  Year,
}

export interface IUploadFilesSceneSession {
  user: {
    telegramId: number;
    person: IPerson;
  };
  sessionId: string;
  uploadingInfo: UploadingFilesInfo;
  step: UploadFilesSteps;
  requestsToSend: RequestFile[];
  uploadType: UploadType;
}

export class UploadFilesSceneSession extends Document implements IUploadFilesSceneSession {
  user: {
    telegramId: number;
    person: IPerson;
  };
  sessionId: string;
  uploadingInfo: UploadingFilesInfo;
  step: UploadFilesSteps;
  requestsToSend: RequestFile[];
  uploadType: UploadType;
}
