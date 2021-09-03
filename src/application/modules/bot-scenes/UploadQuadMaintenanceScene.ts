import { BaseScene } from 'telegraf';
import { BaseSceneOptions, SceneContextMessageUpdate } from 'telegraf/typings/stage';
import { IPerson } from '../../../core/sheets/config/personsStore';
import { RequestFile, UploadingFilesInfo } from '../../../core/sheets/filesUploading/uploadingFilesInfo';

export enum UploadFilesSteps {
  Cancelled = -1,
  Enter,
  Uploading,
  UploadingConfirmed,
  Completed,
}

export interface UploadFilesSceneState {
  user: {
    telegramId: number;
    person: IPerson;
  };
  sessionId: string;
  uploadingInfo: UploadingFilesInfo;
  step: UploadFilesSteps;
  requestsToSend: RequestFile[];
}
