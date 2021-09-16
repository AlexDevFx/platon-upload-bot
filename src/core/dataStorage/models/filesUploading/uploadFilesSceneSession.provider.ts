import { Connection } from 'mongoose';
import { UploadFilesSceneSessionSchema } from './uploadFilesSceneSession.schema';

export const uploadFilesSceneSessionProvider = [
  {
    provide: 'UPLOADFILESCENESESSION_MODEL',
    useFactory: (connection: Connection) => connection.model('UploadFilesSceneSession', UploadFilesSceneSessionSchema),
    inject: ['DATABASE_CONNECTION'],
  },
];
