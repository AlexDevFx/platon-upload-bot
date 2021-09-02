import { UploadedFile } from '../../sheets/filesUploading/uploadingFilesInfo';
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

  constructor(id: string, equipmentId: string, equipmentName: string, file: FileData) {
    this.id = id;
    this.equipmentId = equipmentId;
    this.equipmentName = equipmentName;
    this.status = RequestStatus.Unknown as number;
    this.file = file;
  }
}

export enum RequestStatus {
  Unknown,
  Confirmed,
  Rejected,
}
