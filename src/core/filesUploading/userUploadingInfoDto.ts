import { UploadedFile } from '../sheets/filesUploading/uploadingFilesInfo';
import exp = require('constants');

export interface IUserUploadingInfo {
  //files: RequestedFile[];
  id: string;
  username: string;
}

export class UserUploadingInfoDto {
  public files: RequestedFile[];
  public username: string;
  public userId: number;
  public maintenanceId: string;
  public sessionId: string;
}

export class FileRequestData {
  public id: string;
  public file: UploadedFile;

  constructor(id: string, file: UploadedFile) {
    this.id = id;
    this.file = file;
  }
}

export class FileData {
  public url: string;
  public name: string;
  public size: number;
}

export class RequestedFile {
  public id: string;
  public equipmentId: string;
  public equipmentName: string;
  public status: number;
  public file: FileData;
  public confirmatorId: string;
  public index: number;

  constructor(id: string, equipmentId: string, equipmentName: string, file: FileData, index: number) {
    this.id = id;
    this.equipmentId = equipmentId;
    this.equipmentName = equipmentName;
    this.status = RequestStatus.Unknown;
    this.file = file;
    this.index = index;
  }
}

export enum RequestStatus {
  Unknown,
  Confirmed,
  Rejected,
}
