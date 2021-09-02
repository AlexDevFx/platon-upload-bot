import { Injectable } from '@nestjs/common';
import { LoggerService } from 'nest-logger';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as readline from 'readline';
import { ConfigurationService } from '../../config/configuration.service';
const CRED_PATH = '../config/drive-credentials.json';
const DRIVE_TOKEN_PATH = '../config/drive-token.json';

export interface IUploadResult {
  success: boolean;
  fileUrl: string;
  fileId: string;
}

@Injectable()
export class FileStorageService {
  constructor(private readonly logger: LoggerService, private readonly configuration: ConfigurationService) {}

  private async getStorageClient(): Promise<any> {
    try {
      const authToken = await this.authorize();

      const drive = google.drive({
        version: 'v3',
        auth: authToken,
      });

      return drive;
    } catch (e) {
      this.logger.error('Google drive getting error', e);
    }
  }

  public async upload(fileName, fileSize, parentFolderId, onProgressFunction): Promise<IUploadResult> {
    const drive = await this.getStorageClient();
    const result = await drive.files.create(
      {
        requestBody: {
          name: fileName,
          parents: [parentFolderId ?? this.configuration.appconfig.googleDriveFolderId],
          fields: 'id,shortcutDetails',
        },
        media: {
          body: fs.createReadStream(fileName),
        },
      },
      {
        onUploadProgress: evt => {
          const progress = (evt.bytesRead / fileSize) * 100;
          onProgressFunction?.call(progress);
        },
      },
    );
    fs.unlinkSync(fileName);
    return {
      success: result.status === 200,
      fileUrl: result.status === 200 ? `https://drive.google.com/file/d/${result.data.id}/view?usp=sharing` : undefined,
      fileId: result.data.id,
    };
  }

  public async getOrCreateFolder(folderName, parentId, onProgressFunction): Promise<IUploadResult> {
    const drive = await this.getStorageClient();
    let pageToken = null;
    let listQuery = `name = '${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed = false`;
    listQuery += ` and '${parentId ?? this.configuration.appconfig.googleDriveFolderId}' in parents`;

    const foldersListResponse = await drive.files.list({
      q: listQuery,
      fields: 'nextPageToken, files(id, name)',
      spaces: 'drive',
      pageToken: pageToken,
    });

    if (foldersListResponse.status === 200 && foldersListResponse.data.files && foldersListResponse.data.files.length > 0) {
      const folder = foldersListResponse.data.files[0];
      return {
        success: true,
        fileUrl: `https://drive.google.com/drive/folders/${folder.id}/view?usp=sharing`,
        fileId: folder.id,
      };
    }

    const result = await drive.files.create(
      {
        requestBody: {
          name: folderName,
          parents: [parentId ?? this.configuration.appconfig.googleDriveFolderId],
          mimeType: 'application/vnd.google-apps.folder',
          fields: 'id,shortcutDetails',
        },
      },
      {
        onUploadProgress: evt => {
          const progress = 100;
          onProgressFunction?.call(progress);
        },
      },
    );
    return {
      success: result.status === 200,
      fileUrl: result.status === 200 ? `https://drive.google.com/drive/folders/${result.data.id}/view?usp=sharing` : undefined,
      fileId: result.data.id,
    };
  }

  public async shareFolderForReading(folderId): Promise<IUploadResult> {
    const drive = await this.getStorageClient();
    const result = await drive.permissions.create({
      resource: {
        type: 'anyone',
        role: 'reader',
      },
      fileId: folderId,
      fields: 'id',
    });

    return {
      success: result.status === 200,
      fileUrl: result.status === 200 ? `https://drive.google.com/drive/folders/${folderId}?usp=sharing` : undefined,
      fileId: folderId,
    };
  }

  private async authorize() {
    try {
      const cred = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
      const { client_secret, client_id, redirect_uris } = cred.installed;
      const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

      if (fs.existsSync(DRIVE_TOKEN_PATH)) {
        oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(DRIVE_TOKEN_PATH, 'utf8')));
        return oAuth2Client;
      }
      return this.getNewToken(oAuth2Client);
    } catch (e) {
      this.logger.error('Google authorization error', e);
    }
  }

  private async getNewToken(oAuth2Client: OAuth2Client): Promise<OAuth2Client> {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'],
    });
    this.logger.log(`Authorize this app by visiting this url: ${authUrl}`);

    return (await new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('Enter the code from that page here: ', code => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
          reject(err);
          if (!token) {
            reject();
          }
          oAuth2Client.setCredentials(token!);

          fs.writeFileSync(DRIVE_TOKEN_PATH, JSON.stringify(token));

          resolve(oAuth2Client);
        });
      });
    })) as OAuth2Client;
    ;
  }
}
