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

async function patchProfile(actor: string | undefined, body: unknown) {
  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (actor !== undefined) headers['X-Demo-User'] = actor;
  return fetch(`${baseUrl}/demo/profile`, {
    method: 'PATCH',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function admin(actor: string | undefined) {
  const headers: Record<string, string> = {};
  if (actor !== undefined) headers['X-Demo-User'] = actor;
  return fetch(`${baseUrl}/demo/admin`, {headers});
}

describe('PATCH /demo/profile — ordinary update', async () => {
  it('initial admin access is denied for both fixture users', async () => {
    assert.equal((await admin('alice')).status, 403);
    assert.equal((await admin('bob')).status, 403);
  });

  it('ordinary Bob email/displayName update succeeds and stays non-admin', async () => {
    const res = await patchProfile('bob', {
      email: 'bob.updated@example.test',
      displayName: 'Bobby',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    // Update response uses the public projection (no isAdmin).
    assert.deepEqual(body, {
      username: 'bob',
      email: 'bob.updated@example.test',
      displayName: 'Bobby',
    });
    assert.equal('isAdmin' in body, false);
    // Still non-admin.
    assert.equal((await admin('bob')).status, 403);
  });

  it('invalid update bodies are rejected without changing authorization state', async () => {
    const invalidBodies: unknown[] = [
      {},
      {username: 'alice'},
      {unknownProp: true},
      {email: 'not-an-email'},
      {email: 123},
      {displayName: ''},
      {displayName: 42},
      {isAdmin: 'true'},
      {isAdmin: 1},
      {isAdmin: null},
    ];
    for (const body of invalidBodies) {
      const res = await patchProfile('bob', body);
      assert.equal(res.status, 400, `body ${JSON.stringify(body)} must be rejected`);
      const text = await res.text();
      assert.ok(!text.includes('"isAdmin":true'), 'must not grant admin');
    }
    // Authorization state unchanged.
    assert.equal((await admin('bob')).status, 403);
  });

  it('missing / invalid actor is rejected before any change', async () => {
    assert.equal((await patchProfile(undefined, {isAdmin: true})).status, 400);
    assert.equal((await patchProfile('charlie', {isAdmin: true})).status, 400);
    assert.equal((await admin('bob')).status, 403);
  });

  it('actor cannot update another user via body', async () => {
    // username is immutable and rejected; there is no other-user write path.
    const res = await patchProfile('alice', {username: 'bob', isAdmin: true});
    assert.equal(res.status, 400);
    assert.equal((await admin('bob')).status, 403);
  });
});

describe('PATCH /demo/profile — mass-assignment privilege escalation', async () => {
  it('Bob self-update including isAdmin:true succeeds', async () => {
    const res = await patchProfile('bob', {isAdmin: true});
    assert.equal(res.status, 200);
    const body = await res.json();
    // The response itself uses the public projection and does not disclose
    // isAdmin.
    assert.equal('isAdmin' in body, false);
    assert.equal(body.username, 'bob');
  });

  it('a later Bob admin request returns the synthetic admin-only content', async () => {
    const res = await admin('bob');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      scope: 'admin',
      report: 'Synthetic admin-only report',
    });
  });

  it('Alice remains non-admin after Bob privilege change', async () => {
    assert.equal((await admin('alice')).status, 403);
    const profile = await fetch(`${baseUrl}/demo/profile`, {
      headers: {'X-Demo-User': 'alice'},
    });
    const body = await profile.json();
    assert.equal('isAdmin' in body, false);
  });

  it('admin authorization is re-evaluated per request (no caching)', async () => {
    // Revoke bob through the ordinary update and confirm the decision flips.
    const res = await patchProfile('bob', {isAdmin: false});
    assert.equal(res.status, 200);
    assert.equal((await admin('bob')).status, 403);
  });
});
