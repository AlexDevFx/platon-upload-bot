import * as mongoose from 'mongoose';

export const UserUploadingSchema = new mongoose.Schema({
  files: [
    {
      equipmentId: String,
      equipmentName: String,
      confirmatorId: String,
      id: String,
      status: Number,
      file: {
        url: String,
        name: String,
        size: Number,
      },
    },
  ],
  username: String,
  userId: Number,
  maintenanceId: String,
  sessionId: String,
});
