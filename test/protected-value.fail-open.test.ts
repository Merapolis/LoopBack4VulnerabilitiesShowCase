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
  // Guard the baseline rule: loopback interface only.
  if (!url.startsWith('http://127.0.0.1:')) {
    throw new Error(`Server is not loopback-only: ${url}`);
  }
  baseUrl = url;
});

after(async () => {
  await app.stop();
});

// Helper: POST to the protected-value demo endpoint with a fixture actor.
async function readProtected(
  actor: string | undefined,
  body: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (actor !== undefined) {
    headers['X-Demo-User'] = actor;
  }
  return fetch(`${baseUrl}/demo/protected-values/read`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const ALICE = 'ALICE-RESOURCE-001';
const BOB = 'BOB-RESOURCE-001';

describe('Protected-value projection fail-open: behavior matrix', async () => {
  it('normal scripted client: alice with {owner: true, value: 1} gets owner and value', async () => {
    const res = await readProtected('alice', {
      secretId: ALICE,
      fields: {owner: true, value: 1},
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.owner, 'alice');
    assert.equal(body.value, 'Alice secret');
  });

  it('owner mismatch control: bob including owner receives 403', async () => {
    const res = await readProtected('bob', {
      secretId: ALICE,
      fields: {owner: true, value: 1},
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.message, 'Access denied');
  });

  it('vulnerable omission: bob requesting only {value: true} gets Alice secret', async () => {
    const res = await readProtected('bob', {
      secretId: ALICE,
      fields: {value: true},
    });
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.ok(raw.includes('Alice secret'), 'must disclose the protected value');
    assert.ok(!raw.includes('owner'), 'projected response must omit owner');
    assert.ok(!raw.includes('alice'), 'projected response must omit owner');
    const body = JSON.parse(raw);
    assert.equal(body.value, 'Alice secret');
    assert.equal('owner' in body, false);
  });

  it('equivalent selector: {value: 1} produces the same disclosure as {value: true}', async () => {
    const res = await readProtected('bob', {
      secretId: ALICE,
      fields: {value: 1},
    });
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.ok(raw.includes('Alice secret'));
    assert.ok(!raw.includes('owner'));
    const body = JSON.parse(raw);
    assert.equal(body.value, 'Alice secret');
    assert.equal('owner' in body, false);
  });

  it('symmetric: alice including owner on bob resource is denied (403)', async () => {
    const res = await readProtected('alice', {
      secretId: BOB,
      fields: {owner: true, value: 1},
    });
    assert.equal(res.status, 403);
  });

  it('symmetric: alice omitting owner discloses Bob secret', async () => {
    const res = await readProtected('alice', {
      secretId: BOB,
      fields: {value: true},
    });
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.ok(raw.includes('Bob secret'));
    assert.ok(!raw.includes('owner'));
    const body = JSON.parse(raw);
    assert.equal(body.value, 'Bob secret');
    assert.equal('owner' in body, false);
  });

  it('owner-only selection is rejected because the value selector is required', async () => {
    // The contract requires the value selector; owner alone is incomplete.
    const res = await readProtected('bob', {
      secretId: ALICE,
      fields: {owner: true},
    });
    assert.equal(res.status, 400);
    const raw = await res.text();
    assert.ok(!raw.includes('Alice secret'), 'must not disclose the value');
  });

  it('exact secretId matching: wildcard-looking ids locate nothing', async () => {
    for (const id of ['ALICE-%', '%', 'ALICE-RESOURCE-00_', 'alice-resource-001', 'ALICE-RESOURCE-001 ']) {
      const res = await readProtected('bob', {
        secretId: id,
        fields: {value: true},
      });
      assert.equal(res.status, 404, `secretId ${JSON.stringify(id)} must not match`);
      const body = await res.json();
      assert.equal(body.error.message, 'Resource not found');
    }
  });
});

describe('Protected-value prerequisites and validation (controlled 400)', async () => {
  it('missing X-Demo-User actor yields 400 without disclosure', async () => {
    const res = await readProtected(undefined, {
      secretId: ALICE,
      fields: {value: true},
    });
    assert.equal(res.status, 400);
    const raw = await res.text();
    assert.ok(!raw.includes('Alice secret'));
  });

  it('invalid X-Demo-User actor yields 400 without disclosure', async () => {
    const res = await readProtected('charlie', {
      secretId: ALICE,
      fields: {value: true},
    });
    assert.equal(res.status, 400);
    const raw = await res.text();
    assert.ok(!raw.includes('Alice secret'));
  });

  it('missing secretId yields 400', async () => {
    const res = await readProtected('bob', {fields: {value: true}});
    assert.equal(res.status, 400);
  });

  it('wrong-typed / empty / overlong secretId yields 400', async () => {
    for (const secretId of [123, '', 'x'.repeat(65)]) {
      const res = await readProtected('bob', {secretId, fields: {value: true}});
      assert.equal(res.status, 400);
    }
  });

  it('unknown but well-formed secretId yields generic 404 without disclosure', async () => {
    const res = await readProtected('bob', {
      secretId: 'CAROL-RESOURCE-001',
      fields: {value: true},
    });
    assert.equal(res.status, 404);
    const raw = await res.text();
    assert.ok(!raw.includes('Alice secret'));
    assert.ok(!raw.includes('Bob secret'));
  });

  it('missing fields yields 400', async () => {
    const res = await readProtected('bob', {secretId: ALICE});
    assert.equal(res.status, 400);
  });

  it('empty fields yields 400 (value selector required)', async () => {
    const res = await readProtected('bob', {secretId: ALICE, fields: {}});
    assert.equal(res.status, 400);
  });

  it('missing value selector yields 400', async () => {
    const res = await readProtected('bob', {
      secretId: ALICE,
      fields: {owner: true},
    });
    assert.equal(res.status, 400);
  });

  it('unsupported selector names yield 400', async () => {
    for (const key of ['ownerId', 'content', 'id', 'title', 'secretId', 'where', 'include', 'order', 'limit']) {
      const res = await readProtected('bob', {
        secretId: ALICE,
        fields: {value: true, [key]: true},
      });
      assert.equal(res.status, 400, `selector ${key} must be rejected`);
    }
  });

  it('false / zero / null / string / other-number / object selectors yield 400', async () => {
    for (const bad of [false, 0, null, 'true', '1', 2, -1, 1.5, [], {}]) {
      const res = await readProtected('bob', {
        secretId: ALICE,
        fields: {value: bad},
      });
      assert.equal(res.status, 400, `selector ${JSON.stringify(bad)} must be rejected`);
    }
  });

  it('unexpected top-level properties yield 400', async () => {
    const res = await readProtected('bob', {
      secretId: ALICE,
      fields: {value: true},
      where: {owner: 'bob'},
    });
    assert.equal(res.status, 400);
  });

  it('non-object body yields 400', async () => {
    const res = await readProtected('bob', 'not-an-object');
    assert.equal(res.status, 400);
  });
});

describe('Protected-value isolation and baseline regressions', async () => {
  it('no generic ProtectedValue CRUD routes are registered', async () => {
    const attempts = [
      ['GET', '/protected-values'],
      ['GET', '/protected-values/ALICE-RESOURCE-001'],
      ['POST', '/protected-values'],
      ['GET', '/demo/protected-values'],
      ['POST', '/demo/protected-values'],
    ];
    for (const [method, path] of attempts) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {'Content-Type': 'application/json'},
      });
      assert.equal(res.status, 404, `${method} ${path} must not be a route`);
    }
  });

  it('ordinary document routes never mention the protected-value namespace', async () => {
    const res = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'alice'},
    });
    const raw = await res.text();
    assert.ok(!raw.includes('RESOURCE-001'));
    assert.ok(!raw.includes('secretId'));
  });

  it('document ownership behavior and byte-identical 404s remain intact', async () => {
    const listRes = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'bob'},
    });
    const bobDocs = await listRes.json();
    const bobPrivate = bobDocs.find((d: any) => d.title === 'Bob Private');
    if (!bobPrivate) throw new Error('fixture missing: Bob Private');

    const inaccessible = await fetch(`${baseUrl}/documents/${bobPrivate.id}`, {
      headers: {'X-Demo-User': 'alice'},
    });
    const nonexistent = await fetch(
      `${baseUrl}/documents/${bobPrivate.id + 1000}`,
      {headers: {'X-Demo-User': 'alice'}},
    );
    assert.equal(inaccessible.status, 404);
    assert.equal(nonexistent.status, 404);
    assert.equal(await nonexistent.text(), await inaccessible.text());
  });

  it('document fixtures are unchanged (three seeded documents)', async () => {
    const res = await fetch(`${baseUrl}/documents`, {
      headers: {'X-Demo-User': 'bob'},
    });
    const docs = await res.json();
    const titles = docs.map((d: any) => d.title).sort();
    assert.deepEqual(titles, ['Bob Private', 'Public Document']);
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
