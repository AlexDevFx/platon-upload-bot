import * as mongoose from 'mongoose';

export const UserUploadingSchema = new mongoose.Schema({
  files: [
    {
      message: String,
      id: String,
      status: Number,
      file: {
        url: String,
        name: String,
        size: Number,
      },
    },
  ],
  id: String,
  username: String,
});
