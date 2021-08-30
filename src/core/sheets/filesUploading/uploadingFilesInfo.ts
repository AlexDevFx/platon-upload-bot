export class UploadingFilesInfo {
  files: UploadedFile[];
  sskNumber: string;
  folderUrl: string;
}

export class UploadedFile {
  url: string;
  name: string;
  size: number;
}
