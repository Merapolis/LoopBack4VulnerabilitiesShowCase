# LoopBack 4 Oracle Lab

## Objective

Build a minimal LoopBack 4 + TypeScript application for a blog demonstration.
First produce a clean, secure baseline. Do not implement the wildcard-oracle
vulnerability yet; that will be a separate, explicitly marked change later.

## Non-negotiable rules

- Use npm and Node.js 22. Do not install anything globally.
- Never guess package versions. Verify versions, dependencies, and peers with
  `npm view <package>@<range> version dependencies peerDependencies --json`.
- Prefer exact direct dependency versions and always commit package-lock.json.
- Never use `npm audit fix --force`, `npm install --force`, or
  `--legacy-peer-deps`.
- Do not run interactive generators or one-shot application generators.
- Stop if dependencies cannot resolve without those escape hatches.
- Bind the HTTP server to 127.0.0.1 only.
- Do not add Docker, a database server, authentication packages, API keys,
  network services, or unrelated frameworks.

## Dependency policy

Use a deliberately small manually written scaffold, not the complete lb4
application template.

Runtime:
- @loopback/core: compatible 7.x release
- @loopback/rest: 16.0.0
- @loopback/repository: 9.0.0
- reflect-metadata
- tslib if required by the TypeScript configuration

Development:
- TypeScript: latest verified 6.x release
- @types/node: latest verified 22.x release
- Use Node's built-in node:test runner, not Mocha.

Do NOT install:
- @loopback/boot
- @loopback/build
- @loopback/testlab
- @loopback/rest-explorer
- @loopback/service-proxy
- ts-node

Register the datasource, repository, and controllers explicitly in
application.ts. Do not use BootMixin or app.boot().

Compile with tsc and run compiled JavaScript with Node.

## Audit remediation

Run `npm audit` and `npm audit --omit=dev` before declaring dependency work
complete.

Use ordinary patch/minor updates where valid. Inspect every advisory and its
dependency path with `npm ls`.

If a transitive override is needed, make it as narrowly scoped as possible,
explain what compatibility boundary it crosses, and test the resulting
behavior. Never sweep all packages into a global override.

Known minimum patched versions at the start of this project (11th November 2026):
- undici: 6.29.1
- @fastify/busboy: 3.2.2
- minimatch: 11.0.1
- uuid: 11.1.1

The minimatch upgrade needs particular scrutiny because juggler currently
requests version 10.x. Any override must be scoped to juggler and accompanied
by wildcard/filter behavior tests.

## Working process

Work in small phases. After each phase, report:
1. Files changed.
2. Dependency changes and justification.
3. Commands actually run.
4. Build, test, and audit results.
5. Any unresolved issue.

Stop after the requested phase. Do not silently continue into later phases.

## Required checks

Before calling the baseline complete:

- npm ci succeeds from a clean install.
- npm run build succeeds.
- npm test succeeds.
- npm ls reports no invalid or missing dependencies.
- npm install produces no ERESOLVE warnings.
- npm audit and npm audit --omit=dev report zero unintended findings.
- A fresh `rm -rf node_modules && npm ci` still builds and tests successfully.
## Phase decisions (append-only log)

These notes record implementation decisions made while building the lab. They
supplement, and do not replace, the rules above.

- `useDefineForClassFields: false` in tsconfig.json is intentional. LoopBack
  entity models rely on property decorators and juggler assigning values onto
  instances; ES2022 class-field semantics (`useDefineForClassFields: true`)
  would re-initialize declared fields and clobber the data juggler assigns
  before validation. Do not remove this flag.
- Generated ids must not be supplied in create payloads. The `Document` model
  marks `id` with `generated: true`; the connector (memory connector) assigns
  ids at creation time, and juggler rejects explicit ids in `create()` with
  `` `id` can't be set ``. Seed data and tests must never pass `id` to
  `create()`.
- Tests must not depend on memory-generated ids (no hardcoded `2`/`3`
  fixtures) unless the test is specifically about id generation. Locate
  fixtures by stable attributes such as title/owner, or capture the
  connector-generated id from created/listed records.
- Compiled entrypoint and layout: tsconfig.json compiles both `src/` and
  `test/` (no `rootDir`) into `dist/`, so the actual layout is
  `dist/src/...` (application) and `dist/test/...` (compiled tests). The
  runtime entrypoint is `dist/src/application.js`; `package.json` `main` and
  the `npm start` script point there. `npm test` runs `node --test
  "dist/**/*.test.js"`.
- Stale compiled artifacts must never be committed into `src/` or `test/`;
  build output belongs under `dist/` only (see .gitignore).

## Demo branch decision (demo/wildcard-oracle)

- The resolver `DemoController.resolveIdentity`
  (`src/controllers/demo.controller.ts`) is **intentionally vulnerable and
  must not be changed during routine cleanup** on this branch. It accepts the
  caller's entire `where` object and passes it to `findOne({where})`
  unchanged — it does not inject `ownerId`, pick operators, or restrict which
  properties/operators the query may use. The application never intended to
  expose wildcards, but because `like` (and `%`/`_`) is just one of the memory
  connector's operators, the caller can introduce it themselves; blind trust
  of caller-supplied query data is what makes wildcards reachable. Ownership
  is deliberately decided only AFTER the lookup, producing the differential
  403-vs-404 access-ID oracle this branch demonstrates. The vulnerability is
  present **only** in the resolver; the protected document route
  (`GET /demo/users/{ownerId}/documents`) must keep its exact-equality
  credential check. The secure refactor (build a fixed server-side query on
  the secret, and/or decide ownership before responding) belongs to a future,
  explicitly marked change — not to routine maintenance.
- The seeded access IDs (`alice → BLOG`, `bob → SAFE`, `carol → CODE`,
  `dave → DAVE`) are fixed educational fixtures, four uppercase letters
  without repeats; they are synthetic test values, not credentials, and
  `accessId` is marked `hidden` on the model so serialization never exposes
  it.

- The landing page at `GET /` (`src/controllers/landing.controller.ts`,
  `LandingController`) is demo-branch presentation only: it calls the same HTTP
  endpoints a manual tester would, holds no secrets (tests assert the page
  never contains BLOG/SAFE), and must not grow business logic, authentication,
  or extra routes.
