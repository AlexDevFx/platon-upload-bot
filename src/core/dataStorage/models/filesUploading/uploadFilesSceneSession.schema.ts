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
            status: Number
        },
    ],
    user: {
        telegramId: Number,
        person: {
            id: String,
            telegramUsername: String,
            fullName: String,
            role: Number
        }
    },
    sessionId: String,
    step: Number,
    uploadingInfo: {
        files: [{
            url: String,
            name: String,
            size: Number
        }],
        maintenanceId: String,
        sskNumber: String,
        folderUrl: String,
        currentRequestIndex: Number,
        requests: [{
            id: String,
            equipmentId: String,
            equipmentName: String,
            message: String,
            confirmatorId: String,
            photoFile: String,
            status: Number
        }],
        currentRequestId: String
    }
});