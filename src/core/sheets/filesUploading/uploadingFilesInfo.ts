export class UploadingFilesInfo {
  files: UploadedFile[];
  maintenanceId: string;
  sskNumber: string;
  folderUrl: string;
  currentRequestIndex: number;
  requests: RequestFile[];
}

export class UploadedFile {
  url: string;
  name: string;
  size: number;
}

export class RequestFile {
  message: string;
  id: string;
  constructor(id: string, message: string) {
    this.id = id;
    this.message = message;
  }
}
