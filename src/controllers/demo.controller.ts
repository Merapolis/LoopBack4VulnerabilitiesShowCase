import {get, post, param, requestBody, HttpErrors} from '@loopback/rest';
import {inject} from '@loopback/core';
import {ApiIdentityRepository} from '../repositories/api-identity.repository';
import {DocumentRepository} from '../repositories/document.repository';
import {Document} from '../models/document.model';

/**
 * DELIBERATELY VULNERABLE DEMO CONTROLLER (branch `demo/wildcard-oracle`).
 *
 * This controller exists only on the intentionally vulnerable educational
 * branch of this lab. It demonstrates an access-ID oracle:
 *
 *   POST /demo/identities/resolve
 *     - passes an attacker-controlled `accessId` pattern (which may contain
 *       the LoopBack memory-connector wildcards `%` and `_`) into a `like`
 *       repository query, and makes the ownership decision only AFTER the
 *       lookup. The resulting 403-vs-404 differential is the oracle.
 *
 *   GET /demo/users/{ownerId}/documents
 *     - the secure counterpart: exact-equality credential check, then
 *       returns the resource owner's documents.
 *
 * `X-Demo-User` is only a fixture-actor selector, NOT authentication.
 * Possession of an exact access ID is the sole credential for the protected
 * demonstration document endpoint. Neither endpoint exposes generic CRUD.
 */
export class DemoController {
  constructor(
    @inject('repositories.ApiIdentityRepository')
    public apiIdentityRepository: ApiIdentityRepository,
    @inject('repositories.DocumentRepository')
    public documentRepository: DocumentRepository,
  ) {}

  /**
   * Require a valid fixture actor for the resolver. Missing or invalid
   * `X-Demo-User` values produce a controlled 400 response.
   */
  private requireDemoUser(actor: string | undefined): 'alice' | 'bob'| 'carol'| 'dave' {
    if (actor === 'alice' || actor === 'bob' || actor === 'carol' || actor === 'dave' ) return actor;
    throw new HttpErrors.BadRequest(
      'A valid X-Demo-User fixture actor (alice or bob) is required',
    );
  }

  /**
   * Strict manual validation of the resolver body. Every malformed request
   * gets a controlled 400 response. Note that `%` and `_` are intentionally
   * NOT rejected, escaped, normalized, or stripped from `accessId`: those
   * wildcard characters are essential to the deliberate flaw demonstrated
   * on this branch.
   */
  private validateResolveBody(
    body: unknown,
  ): {ownerId: string; accessId: string} {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpErrors.BadRequest('Request body must be a JSON object');
    }
    const keys = Object.keys(body).sort();
    if (keys.length !== 2 || keys[0] !== 'accessId' || keys[1] !== 'ownerId') {
      throw new HttpErrors.BadRequest(
        'Request body must contain exactly the properties ownerId and accessId',
      );
    }
    const record = body as Record<string, unknown>;
    const {ownerId, accessId} = record;
    if (ownerId !== 'alice' && ownerId !== 'bob') {
      throw new HttpErrors.BadRequest(
        'ownerId must be a fixed fixture identity (alice or bob)',
      );
    }
    if (
      typeof accessId !== 'string' ||
      accessId.length === 0 ||
      accessId.length > 32
    ) {
      throw new HttpErrors.BadRequest(
        'accessId must be a nonempty string of at most 32 characters',
      );
    }
    return {ownerId, accessId};
  }

  @post('/demo/identities/resolve')
  async resolveIdentity(
    @param.header.string('X-Demo-User') demoUser: string | undefined,
    @requestBody({
      required: true,
      content: {
        'application/json': {
          // The framework-level schema is intentionally permissive; strict
          // manual validation in the handler guarantees a controlled 400 for
          // every malformed request and preserves general request validation.
          schema: {},
        },
      },
    })
    body: unknown,
  ): Promise<{ownerId: string}> {
    const actor = this.requireDemoUser(demoUser);
    const {ownerId, accessId} = this.validateResolveBody(body);

    // ====================================================================
    // *** INTENTIONALLY VULNERABLE QUERY — DO NOT "FIX" IN CLEANUP ******
    // ====================================================================
    // The attacker-controlled `accessId` (which may contain the LoopBack
    // memory-connector wildcards `%` and `_`) is passed directly into a
    // `like` filter, and the caller's actor identity is deliberately NOT
    // part of the query's ownership condition. The ownership decision is
    // made only AFTER this lookup, so an unauthorized match (403) is
    // distinguishable from no match (404) — the access-ID oracle that
    // this educational branch exists to demonstrate. The secure refactor
    // is to avoid wildcard matching on secrets (and/or decide ownership
    // before responding); applying it here would remove the demo.
    const identity = await this.apiIdentityRepository.findOne({
      where: {
        // Attacker-controlled requested owner, not the caller's actor.
        ownerId,
        // Attacker-controlled wildcard pattern.
        accessId: {like: accessId},
      },
    });

    // Ownership decision AFTER the lookup. These two outcomes — generic
    // 404 for "no match" and generic 403 for "match but not your
    // identity" — are the documented oracle signal. Their meanings must
    // stay stable. Neither response ever includes the actual accessId,
    // the matched identity object, or any matching metadata.
    if (!identity) {
      throw new HttpErrors.NotFound('Identity not found');
    }
    if (identity.ownerId !== actor) {
      throw new HttpErrors.Forbidden('Access denied');
    }
    // Success: only the owner identity, nothing else.
    return {ownerId: identity.ownerId};
  }

  @get('/demo/users/{ownerId}/documents')
  async findUserDocuments(
    @param.path.string('ownerId') ownerId: string,
    @param.header.string('X-Access-Id') accessId: string | undefined,
  ): Promise<Document[]> {
    // This route deliberately does NOT read X-Demo-User; there is no
    // fallback to anonymous or fixture-actor access.
    if (!accessId) {
      throw new HttpErrors.Forbidden('Access denied');
    }
    // Exact equality only — no like/nlike, no regular expressions, no
    // prefix matching, and no raw user-controlled repository filter is
    // accepted on this route. The header value must equal the stored
    // access ID exactly (case-sensitive).
    const identity = await this.apiIdentityRepository.findOne({
      where: {ownerId, accessId},
    });
    if (!identity) {
      // Generic 403 for absent header, wrong ID, and unknown user alike:
      // never leak whether the user or access ID exists.
      throw new HttpErrors.Forbidden('Access denied');
    }
    // Exact access ID is the sole credential. Return all documents owned
    // by the resource owner — intentionally including private ones.
    return this.documentRepository.find({where: {ownerId}});
  }
}
