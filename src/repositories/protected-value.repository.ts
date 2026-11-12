import {DefaultCrudRepository} from '@loopback/repository';
import {ProtectedValue} from '../models/protected-value.model';
import {DbDataSource} from '../datasources/db.datasource';
import {inject} from '@loopback/core';

export class ProtectedValueRepository extends DefaultCrudRepository<
  ProtectedValue,
  typeof ProtectedValue.prototype.secretId
> {
  constructor(@inject('datasources.db') dataSource: DbDataSource) {
    super(ProtectedValue, dataSource);
  }
}
