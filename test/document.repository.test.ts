import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {App} from '../src/application';
import {DocumentRepository} from '../src/repositories/document.repository';

let app: App;
let repo: DocumentRepository;

before(async () => {
  app = new App({
    rest: {host: '127.0.0.1', port: 0},
  } as any);
  await app.start();
  repo = await app.get<DocumentRepository>('repositories.DocumentRepository');
});

after(async () => {
  await app.stop();
});

describe('DocumentRepository baseline behavior', async () => {
  it('exact title matching returns single record', async () => {
    const docs = await repo.find({where: {title: 'Public Document'}});
    assert.equal(docs.length, 1);
    assert.equal(docs[0].visibility, 'public');
  });

  it('like operator with wildcard matches substring', async () => {
    // Using % as wildcard per LoopBack's memory connector.
    const docs = await repo.find({where: {title: {like: '%Document%'}}});
    assert.ok(docs.length >= 1, 'Should match at least the public document');
    const titles = docs.map(d => d.title);
    assert.ok(titles.includes('Public Document'));
  });
});
