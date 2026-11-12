import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {App} from '../src/application';

let app: App;
let baseUrl: string;

before(async () => {
  app = new App({rest: {host: '127.0.0.1', port: 0}} as any);
  await app.start();
  const restServer = (app as any).restServer;
  if (!restServer) throw new Error('RestServer not available');
  const url = restServer.getSync('rest.url');
  if (!url) throw new Error('Base URL not bound');
  if (!url.startsWith('http://127.0.0.1:')) {
    throw new Error(`Server is not loopback-only: ${url}`);
  }
  baseUrl = url;
});

after(async () => {
  await app.stop();
});

function filterQuery(f: unknown): string {
  return '?filter=' + encodeURIComponent(JSON.stringify(f));
}

async function getProfile(actor: string | undefined, query = '') {
  const headers: Record<string, string> = {};
  if (actor !== undefined) headers['X-Demo-User'] = actor;
  return fetch(`${baseUrl}/demo/profile${query}`, {headers});
}

describe('GET /demo/profile — public projection', async () => {
  it('alice normal profile returns exactly public fields, no isAdmin', async () => {
    const res = await getProfile('alice');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      username: 'alice',
      email: 'alice@example.test',
      displayName: 'Alice',
    });
    assert.equal('isAdmin' in body, false);
  });

  it('bob normal profile returns exactly public fields, no isAdmin', async () => {
    const res = await getProfile('bob');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      username: 'bob',
      email: 'bob@example.test',
      displayName: 'Bob',
    });
    assert.equal('isAdmin' in body, false);
  });
});

describe('GET /demo/profile — negative projection discloses isAdmin', async () => {
  it('fields:{displayName:false} omits displayName and reveals isAdmin:false', async () => {
    const res = await getProfile('bob', filterQuery({fields: {displayName: false}}));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.displayName, undefined);
    assert.equal('displayName' in body, false);
    assert.equal(body.isAdmin, false);
    // Other ordinary properties are present because exclusion keeps the rest.
    assert.equal(body.username, 'bob');
    assert.equal(body.email, 'bob@example.test');
  });
});

describe('GET /demo/profile — inclusion projection follows model contract', async () => {
  it('fields:{displayName:true} returns only displayName', async () => {
    const res = await getProfile('bob', filterQuery({fields: {displayName: true}}));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {displayName: 'Bob'});
  });

  it('fields:{isAdmin:true} is accepted as an ordinary model property', async () => {
    const res = await getProfile('bob', filterQuery({fields: {isAdmin: true}}));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {isAdmin: false});
  });
});

describe('GET /demo/profile — empty fields characterization', async () => {
  it('fields:{} behaves as no projection (full entity, including isAdmin)', async () => {
    // Characterizes the installed memory connector: an empty fields object is
    // normalized to "no projection", returning the FULL entity. It is not
    // converted into the safe public projection.
    const res = await getProfile('bob', filterQuery({fields: {}}));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {
      username: 'bob',
      email: 'bob@example.test',
      displayName: 'Bob',
      isAdmin: false,
    });
  });
});

describe('GET /demo/profile — filter validation', async () => {
  it('malformed filter JSON yields controlled 400', async () => {
    const res = await getProfile('bob', '?filter=' + encodeURIComponent('{bad'));
    assert.equal(res.status, 400);
    const text = await res.text();
    assert.ok(!text.includes('isAdmin'));
  });

  it('unsupported filter members (where) yield 400', async () => {
    for (const f of [
      {where: {username: 'alice'}},
      {limit: 1},
      {order: ['username ASC']},
      {skip: 1},
      {include: []},
      {fields: {displayName: true}, where: {username: 'alice'}},
    ]) {
      const res = await getProfile('bob', filterQuery(f));
      assert.equal(res.status, 400, `filter ${JSON.stringify(f)} must be rejected`);
    }
  });

  it('unknown field selectors yield 400', async () => {
    const res = await getProfile('bob', filterQuery({fields: {password: true}}));
    assert.equal(res.status, 400);
  });

  it('array or null fields yield 400', async () => {
    const arr = await getProfile('bob', filterQuery({fields: ['displayName']}));
    assert.equal(arr.status, 400);
    const nul = await getProfile('bob', filterQuery({fields: null}));
    assert.equal(nul.status, 400);
  });

  it('array or null filter yields 400', async () => {
    const arr = await getProfile('bob', filterQuery([]));
    assert.equal(arr.status, 400);
    const nul = await getProfile('bob', filterQuery(null));
    assert.equal(nul.status, 400);
  });

  it('invalid selector value types yield controlled errors without disclosure', async () => {
    // Values that cannot be coerced to a boolean by the framework's filter
    // validation are rejected with a controlled 4xx and never leak isAdmin.
    for (const bad of ['yes', 2, -1, 1.5, {}, []]) {
      const res = await getProfile(
        'bob',
        filterQuery({fields: {displayName: bad}}),
      );
      assert.ok(
        res.status >= 400 && res.status < 500,
        `selector ${JSON.stringify(bad)} must error`,
      );
      const text = await res.text();
      assert.ok(!text.includes('isAdmin'), 'error must not leak isAdmin');
    }
  });

  it('characterizes framework coercion of stringifier boolean selectors', async () => {
    // The installed framework coerces "true"/1 → true and "false"/0/null →
    // false before the handler validates. These are therefore accepted as
    // genuine inclusion/exclusion selectors rather than rejected. Documented
    // actual behavior — not an assumption.
    const inclusion = await getProfile(
      'bob',
      filterQuery({fields: {displayName: 'true'}}),
    );
    assert.equal(inclusion.status, 200);
    assert.deepEqual(await inclusion.json(), {displayName: 'Bob'});

    for (const coercionToFalse of ['false', 0, null]) {
      const res = await getProfile(
        'bob',
        filterQuery({fields: {displayName: coercionToFalse}}),
      );
      assert.equal(res.status, 200, `${JSON.stringify(coercionToFalse)} → false`);
      const body = await res.json();
      assert.equal('displayName' in body, false);
      assert.equal(body.isAdmin, false);
    }
  });
});

describe('GET /demo/profile — actor validation', async () => {
  it('missing actor yields 400', async () => {
    const res = await fetch(`${baseUrl}/demo/profile`);
    assert.equal(res.status, 400);
  });

  it('invalid actor yields 400', async () => {
    const res = await getProfile('charlie');
    assert.equal(res.status, 400);
  });

  it('actor cannot be smuggled via filter to read another user', async () => {
    // The where clause is always the canonical actor; even a well-formed
    // fields projection cannot change which profile is read.
    const res = await getProfile(
      'bob',
      filterQuery({fields: {displayName: true}}),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {displayName: 'Bob'});
  });
});
