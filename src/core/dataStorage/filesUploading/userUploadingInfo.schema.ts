import * as mongoose from 'mongoose';

export const UserUploadingSchema = new mongoose.Schema({
  files: [
    {
      equipmentId: String,
      equipmentName: String,
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
  userId: Number
});