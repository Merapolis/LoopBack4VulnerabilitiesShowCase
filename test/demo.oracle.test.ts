import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {App} from '../src/application';

// Fixture access IDs appear here only so the tests are reproducible; they
// are synthetic educational values defined in the application's seed code.
const ALICE_ACCESS_ID = 'BLOG';
const BOB_ACCESS_ID = 'SAFE';

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
  // Guard the baseline rule: loopback interface only.
  if (!url.startsWith('http://127.0.0.1:')) {
    throw new Error(`Server is not loopback-only: ${url}`);
  }
  baseUrl = url;
});

after(async () => {
  await app.stop();
});

// Helper: POST to the vulnerable resolver with a fixture actor.
async function resolve(
  actor: string | undefined,
  body: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (actor !== undefined) {
    headers['X-Demo-User'] = actor;
  }
  return fetch(`${baseUrl}/demo/identities/resolve`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// Helper: GET the protected per-user document endpoint with a credential.
async function userDocuments(
  ownerId: string,
  accessId?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (accessId !== undefined) {
    headers['X-Access-Id'] = accessId;
  }
  return fetch(`${baseUrl}/demo/users/${ownerId}/documents`, {headers});
}

// Secrets and private document material that must never appear in a
// resolver response body.
const FORBIDDEN_IN_RESOLVER_RESPONSES: string[] = [
  ALICE_ACCESS_ID,
  BOB_ACCESS_ID,
  'CODE',
  'DAVE',
  'Alice Private',
  'Bob Private',
  'Alice secret',
  'Bob secret',
];

describe('Fixture seeds', async () => {
  it('access IDs are four uppercase characters with no duplicates', () => {
    for (const id of [ALICE_ACCESS_ID, BOB_ACCESS_ID]) {
      assert.match(id, /^[A-Z]{4}$/);
      assert.equal(new Set(id).size, 4, `${id} must have no repeated characters`);
    }
  });
});

describe('Demo landing page', async () => {
  it('GET / returns HTML with actor buttons, cases, and curl hints', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    assert.ok(
      (res.headers.get('content-type') || '').includes('text/html'),
    );
    const html = await res.text();
    // Fixture identity buttons.
    assert.ok(html.includes('Alice'));
    assert.ok(html.includes('Bob'));
    assert.ok(html.includes('X-Demo-User'));
    // Both demo endpoints are referenced with curl examples.
    assert.ok(html.includes('/demo/identities/resolve'));
    assert.ok(html.includes('/demo/users/'));
    assert.ok(html.includes('curl'));
    assert.ok(html.includes('X-Access-Id'));
    // Preset cases for click-through.
    assert.ok(html.includes('BL_G'));
    assert.ok(html.includes('BA%'));
    // The landing page must not embed the secret fixtures.
    assert.ok(!html.includes('BLOG'));
    assert.ok(!html.includes('SAFE'));
  });
});

// In this demo model the CALLER supplies the whole `where` query. The
// application never meant to expose wildcards, but because it trusts the
// caller-issued `where` verbatim, the caller can introduce the memory
// connector's `like` operator (and therefore `%` / `_`) themselves.
function likeQuery(owner: string, pattern: string): unknown {
  return {where: {ownerId: owner, accessId: {like: pattern}}};
}

describe('Vulnerable resolver: oracle behavior', async () => {
  it('caller supplies the like operator itself (not injected by the server)', async () => {
    // Using `like` is entirely the caller's choice in the request body.
    const res = await resolve('bob', likeQuery('alice', 'B%'));
    assert.equal(res.status, 403);
  });

  it('nonmatching alice pattern (A%) with bob actor returns 404', async () => {
    const res = await resolve('bob', likeQuery('alice', 'A%'));
    assert.equal(res.status, 404);
    const text = await res.text();
    assert.ok(text.includes('Identity not found'));
  });

  it('matching prefix B% with bob actor returns 403', async () => {
    const res = await resolve('bob', likeQuery('alice', 'B%'));
    assert.equal(res.status, 403);
    const text = await res.text();
    assert.ok(text.includes('Access denied'));
  });

  it('progressively matching prefix BL% returns 403', async () => {
    const res = await resolve('bob', likeQuery('alice', 'BL%'));
    assert.equal(res.status, 403);
  });

  it('nonmatching continuation BA% returns 404', async () => {
    const res = await resolve('bob', likeQuery('alice', 'BA%'));
    assert.equal(res.status, 404);
  });

  it('exact BLOG with bob actor still returns only 403', async () => {
    const res = await resolve('bob', likeQuery('alice', 'BLOG'));
    assert.equal(res.status, 403);
    const text = await res.text();
    assert.ok(!text.includes('BLOG'), 'response must not echo the access ID');
  });

  it('_ acts as a single-character wildcard (BL_G) producing the denied match', async () => {
    const res = await resolve('bob', likeQuery('alice', 'BL_G'));
    assert.equal(res.status, 403);
  });

  it('alice resolving her own matching identity gets only her ownerId', async () => {
    const res = await resolve('alice', likeQuery('alice', 'BLOG'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {ownerId: 'alice'});
  });

  it('alice with a matching wildcard prefix also resolves her own identity', async () => {
    const res = await resolve('alice', likeQuery('alice', 'BL%'));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {ownerId: 'alice'});
  });

  it('characterizes the trusted where: an unmatched unknown property yields 404, not an error', async () => {
    // The where contents are not validated; an unknown property simply does
    // not match any record.
    const res = await resolve('bob', {where: {ownerId: 'alice', nope: 'x'}});
    assert.equal(res.status, 404);
  });

  it('no resolver response ever contains access IDs or private document data', async () => {
    // Exercise every outcome class: 200, 403, 404.
    const requests: Array<[string | undefined, unknown]> = [
      ['alice', likeQuery('alice', 'BLOG')],
      ['alice', likeQuery('alice', 'BL%')],
      ['alice', likeQuery('alice', '%')],
      ['bob', likeQuery('alice', 'B%')],
      ['bob', likeQuery('alice', 'BLOG')],
      ['bob', likeQuery('alice', 'A%')],
      ['bob', likeQuery('bob', 'S%')],
      ['alice', likeQuery('bob', 'SAFE')],
      ['bob', likeQuery('bob', '%')],
    ];
    for (const [actor, body] of requests) {
      const res = await resolve(actor, body);
      const text = await res.text();
      for (const secret of FORBIDDEN_IN_RESOLVER_RESPONSES) {
        assert.ok(
          !text.includes(secret),
          `resolver response leaked ${JSON.stringify(secret)}: ${text}`,
        );
      }
    }
  });

  it('bare % cannot disclose an actual access ID through the response', async () => {
    const res = await resolve('bob', likeQuery('alice', '%'));
    assert.equal(res.status, 403);
    const text = await res.text();
    assert.ok(!text.includes(ALICE_ACCESS_ID));
    assert.ok(!text.includes(BOB_ACCESS_ID));
    // And for the owner herself, only the ownerId comes back.
    const res2 = await resolve('alice', likeQuery('alice', '%'));
    assert.equal(res2.status, 200);
    assert.deepEqual(await res2.json(), {ownerId: 'alice'});
  });
});

describe('Vulnerable resolver: request validation (controlled 400)', async () => {
  it('missing X-Demo-User actor yields 400', async () => {
    const res = await resolve(undefined, likeQuery('alice', 'B%'));
    assert.equal(res.status, 400);
  });

  it('invalid X-Demo-User actor yields 400', async () => {
    const res = await resolve('mallory', likeQuery('alice', 'B%'));
    assert.equal(res.status, 400);
  });

  it('non-object body yields 400', async () => {
    const res = await resolve('alice', 'not-an-object');
    assert.equal(res.status, 400);
  });

  it('body must contain exactly one top-level "where" property', async () => {
    // Old `{ownerId, accessId}` shape is no longer the contract.
    for (const body of [
      {},
      {ownerId: 'alice', accessId: 'B%'},
      {where: {ownerId: 'alice'}, extra: 1},
    ]) {
      const res = await resolve('alice', body);
      assert.equal(res.status, 400, `body ${JSON.stringify(body)} must be rejected`);
    }
  });

  it('where must be a plain object', async () => {
    for (const where of ['x', null, [], 'string']) {
      const res = await resolve('alice', {where});
      assert.equal(res.status, 400, `where ${JSON.stringify(where)} must be rejected`);
    }
  });
});

describe('Protected per-user documents: exact-ID credential', async () => {
  it('BLOG returns only alice documents, including private content', async () => {
    const res = await userDocuments('alice', ALICE_ACCESS_ID);
    assert.equal(res.status, 200);
    const docs = await res.json();
    const titles = docs.map((d: any) => d.title);
    assert.ok(titles.includes('Public Document'));
    assert.ok(titles.includes('Alice Private'));
    assert.ok(!titles.includes('Bob Private'));
    const alicePrivate = docs.find((d: any) => d.title === 'Alice Private');
    assert.equal(alicePrivate.visibility, 'private');
    assert.equal(alicePrivate.ownerId, 'alice');
    // Every returned document belongs to alice.
    for (const d of docs) {
      assert.equal(d.ownerId, 'alice');
    }
  });

  it('SAFE returns only bob documents, including private content', async () => {
    const res = await userDocuments('bob', BOB_ACCESS_ID);
    assert.equal(res.status, 200);
    const docs = await res.json();
    const titles = docs.map((d: any) => d.title);
    assert.ok(titles.includes('Bob Private'));
    assert.ok(!titles.includes('Alice Private'));
    for (const d of docs) {
      assert.equal(d.ownerId, 'bob');
    }
  });

  it('cross-owner IDs are denied (SAFE on alice, BLOG on bob)', async () => {
    const resA = await userDocuments('alice', BOB_ACCESS_ID);
    assert.equal(resA.status, 403);
    const resB = await userDocuments('bob', ALICE_ACCESS_ID);
    assert.equal(resB.status, 403);
  });

  it('missing X-Access-Id yields 403', async () => {
    const res = await userDocuments('alice');
    assert.equal(res.status, 403);
  });

  it('incorrect ID yields 403', async () => {
    const res = await userDocuments('alice', 'NOPE');
    assert.equal(res.status, 403);
  });

  it('unknown user yields generic 403 identical to wrong ID', async () => {
    const resUnknownUser = await userDocuments('charlie', ALICE_ACCESS_ID);
    const resWrongId = await userDocuments('alice', 'NOPE');
    assert.equal(resUnknownUser.status, 403);
    assert.equal(await resUnknownUser.text(), await resWrongId.text());
  });

  it('wildcards do not work as credentials (exact comparison only)', async () => {
    for (const bad of ['%', 'B%', 'BL%', 'BL_G', 'blog', 'BLOG%', '_LOG']) {
      const res = await userDocuments('alice', bad);
      assert.equal(res.status, 403, `X-Access-Id ${bad} must not match`);
    }
  });
});

describe('Baseline regressions after the demo additions', async () => {
  it('ordinary document routes do not disclose access IDs', async () => {
    const targets: Response[] = [
      await fetch(`${baseUrl}/documents`),
      await fetch(`${baseUrl}/documents`, {
        headers: {'X-Demo-User': 'alice'},
      }),
      await fetch(`${baseUrl}/documents/search?title=Public%20Document`),
    ];
    for (const res of targets) {
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(!text.includes(ALICE_ACCESS_ID));
      assert.ok(!text.includes(BOB_ACCESS_ID));
    }
  });

  it('inaccessible vs nonexistent document 404s remain byte-identical', async () => {
    // Locate bob's private document at runtime (by title), no hardcoded ids.
    const listRes = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'bob'},
    });
    const bobDocs = await listRes.json();
    const bobPrivate = bobDocs.find((d: any) => d.title === 'Bob Private');
    if (!bobPrivate) throw new Error('fixture missing: Bob Private');

    const inaccessible = await fetch(
      `${baseUrl}/documents/${bobPrivate.id}`,
      {headers: {'X-Demo-User': 'alice'}},
    );
    const nonexistent = await fetch(
      `${baseUrl}/documents/${bobPrivate.id + 1000}`,
      {headers: {'X-Demo-User': 'alice'}},
    );
    assert.equal(inaccessible.status, 404);
    assert.equal(nonexistent.status, 404);
    assert.equal(await nonexistent.text(), await inaccessible.text());
  });

  it('/ping still works', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {status: 'ok'});
  });

  it('unknown routes still return 404', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
  });
});
