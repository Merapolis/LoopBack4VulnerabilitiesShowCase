import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {App} from '../src/application';

let app: App;
let baseUrl: string;

before(async () => {
  // Use an ephemeral port (0) to avoid conflicts
  app = new App({
    rest: {
      host: '127.0.0.1',
      port: 0,
    },
  } as any);
  await app.start();
  // Retrieve the actual port the server is listening on
  // Access the underlying HTTP server from the RestApplication
  // Retrieve the URL from the RestApplication binding
  const restServer = (app as any).restServer;
  if (!restServer) {
    throw new Error('RestServer not available');
  }
  const baseUrlFromBinding = restServer.getSync('rest.url');
  if (!baseUrlFromBinding) {
    throw new Error('Base URL not available');
  }
  // Guard the baseline rule: the server must bind to the loopback interface
  // only, never to all interfaces.
  if (!baseUrlFromBinding.startsWith('http://127.0.0.1:')) {
    throw new Error(`Server is not loopback-only: ${baseUrlFromBinding}`);
  }
  baseUrl = baseUrlFromBinding;
});

after(async () => {
  await app.stop();
});

describe('Health endpoint', async () => {
  it('should return status ok on GET /ping', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {status: 'ok'});
  });

  it('should return 404 on unknown route', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
  });
});
