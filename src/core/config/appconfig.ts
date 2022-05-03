export interface Appconfig {
  dbConnectionString: string;
  googleDriveFolderId: string;
  db: DbConfig;
  jobs: JobsConfig;
  tempFolder: string;
}

export interface JobsConfig {
  dbConnectionString: string;
  repeatNewRowJobPeriodSeconds: number;
  db: DbConfig;
  uploadJobsCollection: string;
}

export interface DbConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: boolean;
  replicaSet: string;
  tlsCAFile: string;
}
