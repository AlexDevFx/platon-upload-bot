import { FileData, RequestedFile, RequestStatus } from '../../filesUploading/userUploadingInfoDto';

export class UploadingFilesInfo {
  files: RequestedFile[];
  maintenanceId: string;
  sskNumber: string;
  folderUrl: string;
  currentRequestIndex: number;
  requests: RequestFile[];
  currentRequestId: string;
}

export class UploadedFile {
  url: string;
  name: string;
  size: number;
  id: string;
  equipmentId: string;
  equipmentName: string;
  status: number;
  confirmatorId: string;
}

export class RequestFile {
  public id: string;
  public equipmentId: string;
  public equipmentName: string;
  public message: string;
  public confirmatorId: string;
  public photoFile: string;
  public status: RequestStatus;
  public index: number;

  constructor(id: string, equipmentId: string, equipmentName: string, message: string, photoFile: string, index: number) {
    this.id = id;
    this.equipmentId = equipmentId;
    this.equipmentName = equipmentName;
    this.message = message;
    this.photoFile = photoFile;
    this.status = RequestStatus.Unknown;
    this.index = index;
  }
}
