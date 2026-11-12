import {DefaultCrudRepository} from '@loopback/repository';
import {DemoProfile} from '../models/demo-profile.model';
import {DbDataSource} from '../datasources/db.datasource';
import {inject} from '@loopback/core';

export class DemoProfileRepository extends DefaultCrudRepository<
  DemoProfile,
  typeof DemoProfile.prototype.username
> {
  constructor(@inject('datasources.db') dataSource: DbDataSource) {
    super(DemoProfile, dataSource);
  }
}
