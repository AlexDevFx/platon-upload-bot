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

export class UploadQuadMaintenanceScene extends BaseScene<SceneContextMessageUpdate> {
  constructor(id: string, options?: Partial<BaseSceneOptions<SceneContextMessageUpdate>>) {
    super(id, options);
  }

  public confirmUploadedFileRequest: (username: string, requestId: string) => Promise<void>;
  public rejectUploadedFileRequest: (username: string, requestId: string) => Promise<void>;

  public sceneState: UploadFilesSceneState;
}
