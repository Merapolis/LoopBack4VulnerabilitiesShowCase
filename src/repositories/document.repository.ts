import {DefaultCrudRepository} from '@loopback/repository';
import {Document} from '../models/document.model';
import {DbDataSource} from '../datasources/db.datasource';
import {inject} from '@loopback/core';

export class DocumentRepository extends DefaultCrudRepository<
  Document,
  typeof Document.prototype.id
> {
  constructor(@inject('datasources.db') dataSource: DbDataSource) {
    super(Document, dataSource);
  }
}
