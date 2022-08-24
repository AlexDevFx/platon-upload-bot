import * as mongoose from 'mongoose';

export const UploadFilesSceneSessionSchema = new mongoose.Schema({
  requestsToSend: [
    {
      id: String,
      equipmentId: String,
      equipmentName: String,
      message: String,
      confirmatorId: String,
      photoFile: String,
      status: Number,
      code: String,
      index: Number,
      equipmentType: String,
      rowNumber: String
    },
  ],
  user: {
    telegramId: Number,
    person: {
      id: String,
      telegramUsername: String,
      fullName: String,
      role: Number,
    },
  },
  sessionId: String,
  step: Number,
  uploadType: Number,
  uploadingInfo: {
    files: [
      {
        id: String,
        equipmentId: String,
        equipmentName: String,
        status: Number,
        code: String,
        file: {
          url: String,
          name: String,
          size: Number,
          fileId: String,
          path: String,
        },
        confirmatorId: String,
        index: Number,
        equipmentType: String,
        rowNumber: String
      },
    ],
    maintenanceId: String,
    sskNumber: String,
    folderUrl: String,
    currentRequestIndex: Number,
    requests: [
      {
        id: String,
        equipmentId: String,
        equipmentName: String,
        message: String,
        code: String,
        confirmatorId: String,
        photoFile: String,
        status: Number,
        index: Number,
        equipmentType: String,
        rowNumber: String
      },
    ],
    currentRequestId: String,
  },
});
