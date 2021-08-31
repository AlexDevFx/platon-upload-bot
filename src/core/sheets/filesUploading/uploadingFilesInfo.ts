export class UploadingFilesInfo {
  files: UploadedFile[];
  maintenanceId: string;
  folderUrl: string;
}

export class UploadedFile {
  url: string;
  name: string;
  size: number;
}
