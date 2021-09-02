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
