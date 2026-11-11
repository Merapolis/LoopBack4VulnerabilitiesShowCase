import {get, param, HttpErrors} from '@loopback/rest';
import {DocumentRepository} from '../repositories/document.repository';
import {Document} from '../models/document.model';
import {inject} from '@loopback/core';
import {Filter} from '@loopback/repository';

/**
 * DocumentController provides read‑only endpoints for the demo documents.
 *
 * The special header `X-Demo-User` is used **only** to select the fixture actor
 * (alice or bob) for the lab demonstration. It is **not** an authentication
 * mechanism. Any other value results in a 400 Bad Request.
 */
export class DocumentController {
  constructor(
    @inject('repositories.DocumentRepository')
    public documentRepository: DocumentRepository,
  ) {}

  // Helper to validate the demo user header.
  private validateDemoUser(
    demoUser?: string,
  ): 'alice' | 'bob' | undefined {
    if (!demoUser) return undefined;
    if (demoUser === 'alice' || demoUser === 'bob') return demoUser as any;
    throw new HttpErrors.BadRequest(
      'Unsupported X-Demo-User value; allowed: alice, bob',
    );
  }

  @get('/documents')
  async find(
    @param.header.string('X-Demo-User') demoUser?: string,
  ): Promise<Document[]> {
    const user = this.validateDemoUser(demoUser);
    const orConditions: any[] = [{visibility: 'public'}];
    if (user) {
      orConditions.push({ownerId: user, visibility: 'private'});
    }
    const filter: Filter<Document> = {
      where: {or: orConditions},
    };
    return this.documentRepository.find(filter);
  }

  @get('/documents/{id}')
  async findById(
    @param.path.number('id') id: number,
    @param.header.string('X-Demo-User') demoUser?: string,
  ): Promise<Document> {
    const user = this.validateDemoUser(demoUser);
    const doc = await this.documentRepository.findById(id);
    if (doc.visibility === 'public') return doc;
    if (user && doc.ownerId === user && doc.visibility === 'private') {
      return doc;
    }
    // Not found or not accessible – respond with 404.
    throw new HttpErrors.NotFound('Document not found');
  }

  @get('/documents/search')
  async search(
    @param.query.string('title') title: string,
    @param.header.string('X-Demo-User') demoUser?: string,
  ): Promise<Document[]> {
    if (!title) {
      throw new HttpErrors.BadRequest('Query parameter "title" is required');
    }
    const user = this.validateDemoUser(demoUser);
    const orConditions: any[] = [{visibility: 'public'}];
    if (user) {
      orConditions.push({ownerId: user, visibility: 'private'});
    }
    const filter: Filter<Document> = {
      where: {
        and: [
          {title},
          {or: orConditions},
        ],
      },
    };
    return this.documentRepository.find(filter);
  }
}
