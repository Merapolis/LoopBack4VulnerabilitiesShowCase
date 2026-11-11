import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {App} from '../src/application';

let app: App;
let baseUrl: string;

// Fixture identities are resolved at runtime from stable attributes (title and
// owner). Tests must NOT assume the memory connector generates specific ids.
let alicePrivateId: number;
let bobPrivateId: number;
let nonexistentId: number;

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
  // Guard the baseline rule: the server must bind to the loopback interface
  // only, never to all interfaces.
  if (!url.startsWith('http://127.0.0.1:')) {
    throw new Error(`Server is not loopback-only: ${url}`);
  }
  baseUrl = url;

  // Resolve fixture ids from the list endpoints (locating by title), so the
  // tests do not depend on connector-generated id values.
  const aliceRes = await fetch(`${baseUrl}/documents`, {
    headers: {'X-Demo-User': 'alice'},
  });
  if (aliceRes.status !== 200) throw new Error('alice list failed');
  const aliceDocs = await aliceRes.json();
  const alicePriv = aliceDocs.find((d: any) => d.title === 'Alice Private');
  if (!alicePriv) throw new Error('fixture missing: Alice Private');
  alicePrivateId = alicePriv.id;

  const bobRes = await fetch(`${baseUrl}/documents`, {
    headers: {'X-Demo-User': 'bob'},
  });
  if (bobRes.status !== 200) throw new Error('bob list failed');
  const bobDocs = await bobRes.json();
  const bobPriv = bobDocs.find((d: any) => d.title === 'Bob Private');
  if (!bobPriv) throw new Error('fixture missing: Bob Private');
  bobPrivateId = bobPriv.id;

  // An id guaranteed not to exist, derived from observed ids rather than a
  // hardcoded magic number.
  nonexistentId = Math.max(alicePrivateId, bobPrivateId) + 1000;
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
    const res = await fetch(`${baseUrl}/documents/${alicePrivateId}`, {
      headers: {'X-Demo-User': 'alice'},
    });
    assert.equal(res.status, 200);
    const doc = await res.json();
    assert.equal(doc.title, 'Alice Private');
  });

  it('alice cannot fetch bob private document (404)', async () => {
    const res = await fetch(`${baseUrl}/documents/${bobPrivateId}`, {
      headers: {'X-Demo-User': 'alice'},
    });
    assert.equal(res.status, 404);
  });

  it('nonexistent and inaccessible ids are indistinguishable', async () => {
    const inaccessible = await fetch(`${baseUrl}/documents/${bobPrivateId}`, {
      headers: {'X-Demo-User': 'alice'},
    });
    const nonexistent = await fetch(
      `${baseUrl}/documents/${nonexistentId}`,
      {
        headers: {'X-Demo-User': 'alice'},
      },
    );
    // Both status code and response body must be identical.
    assert.equal(inaccessible.status, 404);
    assert.equal(nonexistent.status, 404);
    assert.equal(await nonexistent.text(), await inaccessible.text());
  });

  it('exact title search respects visibility (alice)', async () => {
    const res = await fetch(
      `${baseUrl}/documents/search?title=Alice%20Private`,
      {
        headers: {'X-Demo-User': 'alice'},
      },
    );
    assert.equal(res.status, 200);
    const docs = await res.json();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].ownerId, 'alice');
  });

  it('exact title search hides other actors private documents (bob)', async () => {
    const res = await fetch(
      `${baseUrl}/documents/search?title=Alice%20Private`,
      {
        headers: {'X-Demo-User': 'bob'},
      },
    );
    assert.equal(res.status, 200);
    const docs = await res.json();
    assert.equal(docs.length, 0);
  });

  it('search public document without fixture', async () => {
    const res = await fetch(
      `${baseUrl}/documents/search?title=Public%20Document`,
    );
    assert.equal(res.status, 200);
    const docs = await res.json();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].visibility, 'public');
  });

  it('invalid fixture actor yields 400 on list', async () => {
    const res = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'charlie'},
    });
    assert.equal(res.status, 400);
  });

  it('invalid fixture actor yields 400 on find-by-id', async () => {
    const res = await fetch(`${baseUrl}/documents/${alicePrivateId}`, {
      headers: {'X-Demo-User': 'charlie'},
    });
    assert.equal(res.status, 400);
  });

  it('invalid fixture actor yields 400 on search', async () => {
    const res = await fetch(
      `${baseUrl}/documents/search?title=Public%20Document`,
      {
        headers: {'X-Demo-User': 'charlie'},
      },
    );
    assert.equal(res.status, 400);
  });

  it('unknown route still returns 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
  });
});
