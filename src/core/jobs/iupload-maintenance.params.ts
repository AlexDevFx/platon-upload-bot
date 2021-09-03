import { ISheetUploadRecord } from './isheet-upload.record';

export interface IUploadMaintenanceParams {
  sessionId: string;
  maintenanceId: string;
  fromChatId: number;
  records: ISheetUploadRecord[];
}
