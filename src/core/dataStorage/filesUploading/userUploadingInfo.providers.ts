import { Connection } from 'mongoose';
import { UserUploadingSchema } from './userUploadingInfo.schema';

export const userUploadingInfoProviders = [
  {
    provide: 'USERUPLOADINGINFO_MODEL',
    useFactory: (connection: Connection) => connection.model('UserUploadingInfoDto', UserUploadingSchema),
    inject: ['DATABASE_CONNECTION'],
  },
];
