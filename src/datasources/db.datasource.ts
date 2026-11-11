import {juggler} from '@loopback/repository';
import {inject} from '@loopback/core';

export const dbConfig = {
  name: 'db',
  connector: 'memory',
  localStorage: '',
};

export class DbDataSource extends juggler.DataSource {
  static dataSourceName = 'db';
  static readonly defaultConfig = dbConfig;

  constructor(@inject('datasources.config.db', {optional: true}) cfg?: object) {
    super({...DbDataSource.defaultConfig, ...(cfg ?? {})});
  }
}
