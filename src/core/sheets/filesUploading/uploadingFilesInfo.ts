export class UploadingFilesInfo {
  files: UploadedFile[];
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
}

export class RequestFile {
  public id: string;
  public equipmentId: string;
  public equipmentName: string;
  public message: string;
  public confirmatorId: string;
  public photoFile: string;

  constructor(id: string, equipmentId: string, equipmentName: string, message: string, photoFile: string) {
    this.id = id;
    this.equipmentId = equipmentId;
    this.equipmentName = equipmentName;
    this.message = message;
    this.photoFile = photoFile;
  }
}
