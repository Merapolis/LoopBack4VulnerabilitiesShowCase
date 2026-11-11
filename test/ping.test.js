"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const application_1 = require("../src/application");
let app;
let baseUrl;
(0, node_test_1.before)(async () => {
    // Use an ephemeral port (0) to avoid conflicts
    app = new application_1.App({
        rest: {
            host: '127.0.0.1',
            port: 0,
        },
    });
    await app.start();
    // Retrieve the actual port the server is listening on
    const server = app.getSync('rest.server');
    const address = server.get('httpServer').address();
    const port = address.port;
    baseUrl = `http://127.0.0.1:${port}`;
});
(0, node_test_1.after)(async () => {
    await app.stop();
});
(0, node_test_1.describe)('Health endpoint', async () => {
    (0, node_test_1.it)('should return status ok on GET /ping', async () => {
        const res = await fetch(`${baseUrl}/ping`);
        strict_1.default.equal(res.status, 200);
        const body = await res.json();
        strict_1.default.deepEqual(body, { status: 'ok' });
    });
    (0, node_test_1.it)('should return 404 on unknown route', async () => {
        const res = await fetch(`${baseUrl}/unknown`);
        strict_1.default.equal(res.status, 404);
    });
});
//# sourceMappingURL=ping.test.js.map