import * as mongoose from 'mongoose';
import { ConfigurationService } from '../config/configuration.service';

export const databaseProviders = [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: (configurationService: ConfigurationService): Promise<typeof mongoose> => {
      const dbConfig = configurationService.appconfig.db;
      return mongoose.connect('mongodb://localhost/nest', {
        tls: dbConfig.tls,
        replicaSet: dbConfig.replicaSet,
        tlsCAFile: dbConfig.tlsCAFile,
      });
    },
    inject: [ConfigurationService],
  },
];
