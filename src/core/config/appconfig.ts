export interface Appconfig {
  dbConnectionString: string;
  googleDriveFolderId: string;
  db: DbConfig;
  jobs: JobsConfig;
}

export interface JobsConfig {
  dbConnectionString: string;
  repeatNewRowJobPeriodSeconds: number;
  db: DbConfig;
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
