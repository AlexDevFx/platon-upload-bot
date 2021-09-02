import { UploadedFile } from '../../sheets/filesUploading/uploadingFilesInfo';
import exp = require('constants');

export interface IUserUploadingInfo {
  //files: RequestedFile[];
  id: string;
  username: string;
}

export class UserUploadingInfoDto {
  public files: RequestedFile[];
  public id: string;
  public username: string;
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
  url: string;
  name: string;
  size: number;
}

export class RequestedFile {
  public message: string;
  public id: string;
  public status: number;
  public file: FileData;

  constructor(id: string, message: string, file: FileData) {
    this.id = id;
    this.message = message;
    this.status = RequestStatus.Unknown as number;
    this.file = file;
  }

  public setStatus(newStatus: RequestStatus) {
    this.status = newStatus as number;
  }
}

export enum RequestStatus {
  Unknown,
  Confirmed,
  Rejected,
}
