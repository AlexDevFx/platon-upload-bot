import { RequestedFile, RequestStatus } from '../../filesUploading/userUploadingInfoDto';

export class UploadingFilesInfo {
  files: RequestedFile[];
  maintenanceId: string;
  sskNumber: string;
  maintenanceDate: string;
  folderUrl: string;
  currentRequestIndex: number;
  requests: RequestFile[];
  currentRequestId: string;
}

export class RequestFile {
  public id: string;
  public equipmentId: string;
  public code: string;
  public equipmentName: string;
  public message: string;
  public confirmatorId: string;
  public photoFile: string;
  public status: RequestStatus;
  public index: number;
  public equipmentType: string;
  public rowNumber: string;

  constructor(id: string, equipmentId: string, equipmentName: string, code: string, message: string, photoFile: string, index: number, type: string, rowNumber: string) {
    this.id = id;
    this.equipmentId = equipmentId;
    this.code = code;
    this.equipmentName = equipmentName;
    this.message = message;
    this.photoFile = photoFile;
    this.status = RequestStatus.Unknown;
    this.index = index;
    this.equipmentType = type;
    this.rowNumber = rowNumber;
  }
}
