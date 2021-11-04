import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { Appconfig } from './appconfig';
import { EquipmentSheet } from '../sheets/config/equipmentSheet';
import { MaintenanceSheet } from '../sheets/config/maintenanceSheet';
import { MaintenanceUploadingSheet } from '../sheets/config/maintenanceUploadingSheet';
import { PersonsSheet } from '../sheets/config/personsSheet';
import { YearMaintenanceUploadingSheet } from '../sheets/config/yearMaintenanceUploadingSheet';
import {YearMaintenanceSheet} from "../sheets/config/yearMaintenanceSheet";

@Injectable()
export class ConfigurationService {
  constructor() {
    this.logger = {
      filePrefix: 'app',
    };
  }
  logger: any;
  appconfig: Appconfig = JSON.parse(fs.readFileSync('../config/appconfig.json', 'utf8')) as Appconfig;
  maintenanceSheet: MaintenanceSheet = new MaintenanceSheet(JSON.parse(fs.readFileSync('../config/maintenanceSheet.json', 'utf8')));
  equipmentSheet: EquipmentSheet = new EquipmentSheet(JSON.parse(fs.readFileSync('../config/equipmentSheet.json', 'utf8')));
  yearEquipmentSheet: EquipmentSheet = new EquipmentSheet(JSON.parse(fs.readFileSync('../config/yearEquipmentSheet.json', 'utf8')));
  maintenanceUploadingSheet: MaintenanceUploadingSheet = new MaintenanceUploadingSheet(
    JSON.parse(fs.readFileSync('../config/maintenanceUploadingSheet.json', 'utf8')),
  );
  yearMaintenanceUploadingSheet: YearMaintenanceUploadingSheet = new YearMaintenanceUploadingSheet(
    JSON.parse(fs.readFileSync('../config/yearMaintenanceUploadingSheet.json', 'utf8')),
  );
  personsSheet: PersonsSheet = new PersonsSheet(JSON.parse(fs.readFileSync('../config/personsSheet.json', 'utf8')));
  yearMaintenanceSheet: YearMaintenanceSheet = new YearMaintenanceSheet(JSON.parse(fs.readFileSync('../config/yearMaintenanceSheet.json', 'utf8')));
}
