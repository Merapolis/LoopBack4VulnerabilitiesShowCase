import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {App} from '../src/application';

let app: App;
let baseUrl: string;

before(async () => {
  app = new App({
    rest: {
      host: '127.0.0.1',
      port: 0,
    },
  } as any);
  await app.start();
  const restServer = (app as any).restServer;
  if (!restServer) throw new Error('RestServer not available');
  const url = restServer.getSync('rest.url');
  if (!url) throw new Error('Base URL not bound');
  baseUrl = url;
});

after(async () => {
  await app.stop();
});

describe('Document endpoints', async () => {
  it('public document is visible without fixture', async () => {
    const res = await fetch(`${baseUrl}/documents`);
    assert.equal(res.status, 200);
    const docs = await res.json();
    const publicDoc = docs.find((d: any) => d.title === 'Public Document');
    assert.ok(publicDoc, 'Public document should be present');
  });

  it('alice can access her private document via list', async () => {
    const res = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'alice'},
    });
    assert.equal(res.status, 200);
    const docs = await res.json();
    const alicePriv = docs.find((d: any) => d.title === 'Alice Private');
    assert.ok(alicePriv, 'Alice private document should be visible to alice');
  });

  it('alice cannot see bob private document in list', async () => {
    const res = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'alice'},
    });
    const docs = await res.json();
    const bobPriv = docs.find((d: any) => d.title === 'Bob Private');
    assert.ok(!bobPriv, 'Bob private document should not be visible to alice');
  });

  it('alice can fetch her private document by id', async () => {
    const res = await fetch(`${baseUrl}/documents/2`, {
      headers: {'X-Demo-User': 'alice'},
    });
    assert.equal(res.status, 200);
    const doc = await res.json();
    assert.equal(doc.title, 'Alice Private');
  });

  it('alice cannot fetch bob private document (404)', async () => {
    const res = await fetch(`${baseUrl}/documents/3`, {
      headers: {'X-Demo-User': 'alice'},
    });
    assert.equal(res.status, 404);
  });

  it('nonexistent id returns 404 (same as inaccessible)', async () => {
    const res = await fetch(`${baseUrl}/documents/9999`, {
      headers: {'X-Demo-User': 'alice'},
    });
    assert.equal(res.status, 404);
  });

  it('exact title search respects visibility (alice)', async () => {
    const res = await fetch(`${baseUrl}/documents/search?title=Alice%20Private`, {
      headers: {'X-Demo-User': 'alice'},
    });
    assert.equal(res.status, 200);
    const docs = await res.json();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].ownerId, 'alice');
  });

  it('search public document without fixture', async () => {
    const res = await fetch(`${baseUrl}/documents/search?title=Public%20Document`);
    assert.equal(res.status, 200);
    const docs = await res.json();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].visibility, 'public');
  });

  it('invalid fixture actor yields 400', async () => {
    const res = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'charlie'},
    });
    assert.equal(res.status, 400);
  });

  it('unknown route still returns 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
  });
});
