import {post, param, requestBody, HttpErrors} from '@loopback/rest';
import {inject} from '@loopback/core';
import {ProtectedValueRepository} from '../repositories/protected-value.repository';
import {ProtectedValue} from '../models/protected-value.model';

/**
 * DELIBERATELY VULNERABLE DEMO CONTROLLER (branch
 * `demo/projection-fail-open`).
 *
 * It demonstrates **fail-open authorization caused by performing the
 * ownership check on a client-projected result**:
 *
 *   POST /demo/protected-values/read
 *
 * The ordinary scripted client sends its fixture identity, the exact
 * secretId of the resource, and a field selection that includes BOTH
 * `owner` and `value`:
 *
 *   {"secretId": "ALICE-RESOURCE-001", "fields": {"owner": true, "value": 1}}
 *
 * The server applies that selection in the repository query, so the
 * projected result carries the owner and the protected value, and the
 * ownership comparison works. An attacker who keeps a valid identity and the
 * exact secretId but requests ONLY the value:
 *
 *   {"secretId": "ALICE-RESOURCE-001", "fields": {"value": true}}
 *
 * receives a projected result without the owner — and the vulnerable
 * ownership condition treats the missing metadata as permission, disclosing
 * the protected value. The decisive manipulation is the OMISSION of `owner`;
 * the numeric-vs-boolean selector spelling only mirrors the original client
 * request (both mean "include this field").
 *
 * The projected response is structurally valid JSON. The application flaw is
 * trusting projected output for an ownership decision — it is not JSON
 * corruption or wildcard matching. Production code should retrieve canonical
 * ownership metadata and authorize before projecting a response, or fail
 * closed if required metadata is absent.
 *
 * `X-Demo-User` is only a fixture actor selector, NOT authentication. No
 * generic CRUD routes are exposed for ProtectedValue.
 */
export class ProtectedValueController {
  constructor(
    @inject('repositories.ProtectedValueRepository')
    public protectedValueRepository: ProtectedValueRepository,
  ) {}

  /** Require a valid fixture actor; missing/invalid → controlled 400. */
  private requireDemoUser(actor: string | undefined): 'alice' | 'bob' {
    if (actor === 'alice' || actor === 'bob') return actor;
    throw new HttpErrors.BadRequest(
      'A valid X-Demo-User fixture actor (alice or bob) is required',
    );
  }

  /**
   * Strict manual validation of the request language. Every malformed
   * request gets a controlled 400 response.
   *
   * Returns the validated request plus a freshly created, allowlisted
   * server-side fields object using boolean `true` only. The numeric
   * selector 1 is normalized to true here (both are inclusion selectors in
   * this lab); no owner is ever reinserted during normalization, and no
   * global validation or connector behavior is modified.
   */
  private validateBody(body: unknown): {
    secretId: string;
    projectedFields: Record<string, boolean>;
  } {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpErrors.BadRequest('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length !== 2 || !('secretId' in record) || !('fields' in record)) {
      throw new HttpErrors.BadRequest(
        'Request body must contain exactly the properties secretId and fields',
      );
    }
    const {secretId, fields} = record;

    // secretId: nonempty string, bounded length. The lookup later uses exact
    // equality only — no wildcards, like/nlike, regexp, or raw filters.
    if (
      typeof secretId !== 'string' ||
      secretId.length === 0 ||
      secretId.length > 64
    ) {
      throw new HttpErrors.BadRequest(
        'secretId must be a nonempty string of at most 64 characters',
      );
    }

    // fields: required object; keys exactly owner/value; value required,
    // owner optional. Each selector accepts only JSON boolean true or the
    // JSON number 1.
    if (
      typeof fields !== 'object' ||
      fields === null ||
      Array.isArray(fields)
    ) {
      throw new HttpErrors.BadRequest('fields must be an object');
    }
    const fieldRecord = fields as Record<string, unknown>;
    const fieldKeys = Object.keys(fieldRecord);
    const projectedFields: Record<string, boolean> = {};
    for (const key of fieldKeys) {
      if (key !== 'owner' && key !== 'value') {
        throw new HttpErrors.BadRequest(
          `Unsupported selector ${JSON.stringify(key)}; allowed: owner, value`,
        );
      }
      const selector = fieldRecord[key];
      // Inclusion selectors: JSON true or the number 1 — nothing else.
      if (selector !== true && selector !== 1) {
        throw new HttpErrors.BadRequest(
          `Selector for ${JSON.stringify(key)} must be boolean true or 1`,
        );
      }
      projectedFields[key] = true;
    }
    if (!('value' in projectedFields)) {
      throw new HttpErrors.BadRequest(
        'fields must include a value selector',
      );
    }
    return {secretId, projectedFields};
  }

  @post('/demo/protected-values/read')
  async readProtectedValue(
    @param.header.string('X-Demo-User') demoUser: string | undefined,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          // The framework-level schema is intentionally permissive; strict
          // manual validation in the handler guarantees a controlled 400
          // for every malformed request and preserves general request
          // validation.
          schema: {},
        },
      },
    })
    body: unknown,
  ): Promise<Partial<ProtectedValue>> {
    // 1. Validate actor, exact secretId, and field selectors.
    const actor = this.requireDemoUser(demoUser);
    const {secretId, projectedFields} = this.validateBody(body);

    // 2. Query with exact secretId equality and the caller-selected,
    // validated projection applied in the repository query itself.
    const projected = await this.protectedValueRepository.findOne({
      where: {secretId},
      fields: projectedFields,
    });

    // 3. Generic 404 — the resource does not exist. Never disclose whether
    // a similar id exists.
    if (!projected) {
      throw new HttpErrors.NotFound('Resource not found');
    }

    // =====================================================================
    // *** INTENTIONALLY VULNERABLE OWNERSHIP CHECK — DO NOT "FIX" HERE ***
    // =====================================================================
    // The ownership decision is performed on the CLIENT-PROJECTED result
    // rather than on the canonical stored record. The caller selects which
    // fields the query returns, so omitting the `owner` selector yields a
    // projected object without ownership metadata — and this truthiness
    // guard treats the MISSING owner as no ownership mismatch: fail-open.
    // That is the deliberate flaw this educational branch demonstrates.
    // Do not repair the check during routine cleanup: no second canonical
    // lookup, no authorization before projection, no forced owner in the
    // result, no fail-closed missing-owner denial, and no post-hoc
    // response projection to reshape the keys.
    if (projected.owner && projected.owner !== actor) {
      throw new HttpErrors.Forbidden('Access denied');
    }

    // 6. Return the projected result.
    return projected;
  }
}
