import * as mongoose from 'mongoose';
import { ConfigurationService } from '../config/configuration.service';
import * as util from 'util';

export const databaseProviders = [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: (configurationService: ConfigurationService): Promise<typeof mongoose> => {
      const dbConfig = configurationService.appconfig.db;
      const url = util.format(
          'mongodb://%s:%s@%s',
          dbConfig.username,
          dbConfig.password,
          [`${dbConfig.host}:${dbConfig.port}`].join(','),
      );
      return mongoose.connect(url, {
        tls: dbConfig.tls,
        replicaSet: dbConfig.replicaSet,
        tlsCAFile: dbConfig.tlsCAFile,
      });
    },
    inject: [ConfigurationService],
  },
];
