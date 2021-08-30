import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { Appconfig } from './appconfig';

@Injectable()
export class ConfigurationService {
  constructor() {
    this.logger = {
      filePrefix: 'app',
    };
  }
  logger: any;
  appconfig: Appconfig = JSON.parse(fs.readFileSync('../config/appconfig.json', 'utf8')) as Appconfig;
}
