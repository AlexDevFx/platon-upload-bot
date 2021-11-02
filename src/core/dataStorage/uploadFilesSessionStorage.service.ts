import { Inject, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { IUploadFilesSceneSession, UploadFilesSceneSession } from './models/filesUploading/uploadFilesSceneSession';
import { Mutex } from 'async-mutex';
import { LoggerService } from 'nest-logger';

@Injectable()
export class UploadFilesSessionStorageService {
  constructor(
    @Inject('UPLOADFILESCENESESSION_MODEL')
    private uploadingInfoModel: Model<UploadFilesSceneSession>,
    private logger: LoggerService,
  ) {
    this.sessions = [];
  }

  private sessions: UploadFilesSceneSession[];

  public async insert(data: IUploadFilesSceneSession): Promise<string> {
    const createdData = new this.uploadingInfoModel(data);
    const newData = await createdData.save();
    this.sessions.push(newData);
    return newData._id.toString();
  }

  public async find(sessionId: string): Promise<UploadFilesSceneSession> {
    let session = this.sessions.find(e => e?.sessionId === sessionId);

    if (!session) {
      session = await this.uploadingInfoModel.findOne({ sessionId: sessionId }).exec();
      this.sessions.push(session);
    }

    return session;
  }
  mutex = new Mutex();
  public async update(data: UploadFilesSceneSession): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      data.isNew = false;
      const updated = await data.save();
      let session = this.sessions.find(e => e?.sessionId === data.sessionId);
      if (session) {
        session = data;
      }
      return updated !== undefined;
    } catch (e) {
      this.logger.error(e.message);
    } finally {
      release();
    }

    return false;
  }

  public async delete(sessionId: string): Promise<boolean> {
    const result = await this.uploadingInfoModel.deleteOne({ sessionId: sessionId }).exec();
    this.sessions = this.sessions.filter(e => e?.sessionId !== sessionId);
    return result.deletedCount > 0;
  }
}
