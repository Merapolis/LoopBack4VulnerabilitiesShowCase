import {get, post, param, requestBody, HttpErrors} from '@loopback/rest';
import {inject} from '@loopback/core';
import {Where} from '@loopback/repository';
import {ApiIdentity} from '../models/api-identity.model';
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
 *     - accepts a caller-supplied `where` query and passes it to the
 *       repository UNCHANGED, then makes the ownership decision only AFTER
 *       the lookup. The application never intended callers to use wildcards,
 *       but by trusting the whole `where` object verbatim it hands the caller
 *       the memory connector's query operators (`like`, `regexp`, `or`, ...).
 *       A caller who supplies `like` with `%`/`_` therefore gets wildcard
 *       matching the application never meant to expose, and the resulting
 *       403-vs-404 differential is the oracle.
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
  private requireDemoUser(
    actor: string | undefined,
  ): 'alice' | 'bob' | 'carol' | 'dave' {
    if (
      actor === 'alice' ||
      actor === 'bob' ||
      actor === 'carol' ||
      actor === 'dave'
    ) {
      return actor;
    }
    throw new HttpErrors.BadRequest(
      'A valid X-Demo-User fixture actor (alice, bob, carol or dave) is required',
    );
  }

  /**
   * Validate only the *shape* of the resolver request: a JSON object whose
   * single top-level property is a `where` object. The contents of `where`
   * are deliberately NOT restricted — properties, operators (including
   * `like`), and nesting are all accepted, because this demo models an
   * application that blindly trusts the caller's query. Malformed shapes
   * still produce a controlled 400 response.
   */
  private validateResolveBody(body: unknown): Where<ApiIdentity> {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpErrors.BadRequest('Request body must be a JSON object');
    }

    const keys = Object.keys(body);
    if (keys.length !== 1 || keys[0] !== 'where') {
      throw new HttpErrors.BadRequest('Request body must contain only "where"');
    }

    const where = (body as Record<string, unknown>).where;
    if (where === null || typeof where !== 'object' || Array.isArray(where)) {
      throw new HttpErrors.BadRequest('"where" must be a plain object');
    }

    // No property, operator, or nesting restrictions are applied on purpose:
    // the caller owns the whole query in this demo.
    return where as Where<ApiIdentity>;
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
    const where = this.validateResolveBody(body);

    // ====================================================================
    // *** INTENTIONALLY VULNERABLE QUERY — DO NOT "FIX" IN CLEANUP ******
    // ====================================================================
    // The ENTIRE `where` object is supplied by the caller and is passed to
    // the repository unchanged. The controller does not inject `ownerId`,
    // does not choose or rewrite operators, and does not constrain which
    // properties or operators the query may use. Whatever the memory
    // connector does with `like`, `neq`, `regexp`, `or`, etc. is therefore
    // directly reachable by the caller.
    //
    // The caller's actor identity is deliberately NOT part of the query.
    // Ownership is decided only AFTER this lookup, so an unauthorized
    // match (403) is distinguishable from no match (404) — that
    // difference is the access-ID oracle this branch exists to
    // demonstrate. The secure refactor is to never let a caller-shaped
    // query decide which secret is located, and/or to decide ownership
    // before responding; applying it here would remove the demo.
    const identity = await this.apiIdentityRepository.findOne({where});

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
