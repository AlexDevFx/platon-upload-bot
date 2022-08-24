
export class UserUploadingInfoDto {
  public files: RequestedFile[];
  public username: string;
  public userId: number;
  public maintenanceId: string;
  public sessionId: string;
}

export class FileData {
  public url: string;
  public name: string;
  public size: number;
  public fileId: string;
  public path: string;
}

export class RequestedFile {
  public id: string;
  public equipmentId: string;
  public equipmentName: string;
  public code: string;
  public status: number;
  public file: FileData;
  public confirmatorId: string;
  public index: number;
  public equipmentType: string;
  public rowNumber: string;

  constructor(id: string, equipmentId: string, equipmentName: string, fieldCode: string, file: FileData, index: number, type: string, rowNumber: string) {
    this.id = id;
    this.equipmentId = equipmentId;
    this.equipmentName = equipmentName;
    this.status = RequestStatus.Unknown;
    this.file = file;
    this.index = index;
    this.code = fieldCode;
    this.equipmentType = type;
    this.rowNumber = rowNumber;
  }
}

export enum RequestStatus {
  Unknown,
  Confirmed,
  Rejected,
}
