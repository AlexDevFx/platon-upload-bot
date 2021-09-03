export interface ISheetUploadRecord {
  requestId: string;
  maintenanceId: string;
  equipmentName: string;
  equipmentId: string;
  engineerPersonId: string;
  confirmatorPersonId: string;
  files: string[];
}
