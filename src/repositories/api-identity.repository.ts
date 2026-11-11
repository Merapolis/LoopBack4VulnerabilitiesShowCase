import {DefaultCrudRepository} from '@loopback/repository';
import {ApiIdentity} from '../models/api-identity.model';
import {DbDataSource} from '../datasources/db.datasource';
import {inject} from '@loopback/core';

export class ApiIdentityRepository extends DefaultCrudRepository<
  ApiIdentity,
  typeof ApiIdentity.prototype.ownerId
> {
  constructor(@inject('datasources.db') dataSource: DbDataSource) {
    super(ApiIdentity, dataSource);
  }
}
