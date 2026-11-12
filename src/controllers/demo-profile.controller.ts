import {
  get,
  patch,
  param,
  requestBody,
  HttpErrors,
} from '@loopback/rest';
import {inject} from '@loopback/core';
import {Filter} from '@loopback/repository';
import {DemoProfileRepository} from '../repositories/demo-profile.repository';
import {DemoProfile} from '../models/demo-profile.model';

/**
 * DELIBERATELY VULNERABLE DEMO CONTROLLER (branch
 * `demo/profile-field-authorization`).
 *
 * This demonstrates two consequences of using the complete persistence model
 * as the public API contract without operation-specific DTOs or field-level
 * authorization:
 *
 *  1. On GET /demo/profile, a client-supplied negative `fields` projection
 *     (e.g. `{"fields":{"displayName":false}}`) replaces the server-selected
 *     public projection and discloses `isAdmin`.
 *  2. On PATCH /demo/profile, the model-shaped update body accepts `isAdmin`,
 *     enabling mass-assignment privilege escalation.
 *
 * `isAdmin` is an ordinary persisted property — NOT `hidden: true`. The read
 * disclosure comes from repository field projection, not from a
 * serialization bypass. The privilege escalation comes from accepting the
 * model shape on update, not from any projection trick.
 *
 * `X-Demo-User` is only a fixture actor selector, NOT authentication. The
 * current actor is always derived from that header; it is never taken from a
 * body, query, or path parameter.
 */
export class DemoProfileController {
  // The server-selected public projection used for normal responses.
  private static readonly PUBLIC_FIELDS: Record<string, boolean> = {
    username: true,
    email: true,
    displayName: true,
  };

  // All ordinary persisted model properties, usable in a client projection.
  private static readonly MODEL_FIELDS = [
    'username',
    'email',
    'displayName',
    'isAdmin',
  ];

  // Recognized mutable properties for the self-profile update. `username` is
  // an immutable identifier and is intentionally NOT recognized. `isAdmin` IS
  // recognized — that is the mass-assignment flaw.
  private static readonly MUTABLE_FIELDS = ['email', 'displayName', 'isAdmin'];

  constructor(
    @inject('repositories.DemoProfileRepository')
    public demoProfileRepository: DemoProfileRepository,
  ) {}

  /** Require a valid fixture actor; missing/invalid → controlled 400. */
  private requireDemoUser(actor: string | undefined): 'alice' | 'bob' {
    if (actor === 'alice' || actor === 'bob') return actor;
    throw new HttpErrors.BadRequest(
      'A valid X-Demo-User fixture actor (alice or bob) is required',
    );
  }

  /**
   * Validate a parsed LoopBack filter and return the caller's `fields`
   * projection, or `undefined` when none was supplied. Only the `fields`
   * member is permitted; `fields` must be a plain object whose keys are model
   * properties and whose values are actual booleans (inclusion or exclusion).
   */
  private validateFilter(
    filter: Filter<DemoProfile> | undefined,
  ): Record<string, boolean> | undefined {
    if (filter === undefined) return undefined;
    if (
      filter === null ||
      typeof filter !== 'object' ||
      Array.isArray(filter)
    ) {
      throw new HttpErrors.BadRequest('filter must be a JSON object');
    }
    const keys = Object.keys(filter);
    if (keys.length !== 1 || keys[0] !== 'fields') {
      throw new HttpErrors.BadRequest(
        'Only the "fields" filter member is supported',
      );
    }
    const fields = (filter as Record<string, unknown>).fields;
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
      throw new HttpErrors.BadRequest('filter.fields must be a plain object');
    }
    const projected: Record<string, boolean> = {};
    for (const key of Object.keys(fields)) {
      if (!DemoProfileController.MODEL_FIELDS.includes(key)) {
        throw new HttpErrors.BadRequest(
          `Unknown field selector ${JSON.stringify(key)}`,
        );
      }
      const selector = (fields as Record<string, unknown>)[key];
      if (typeof selector !== 'boolean') {
        throw new HttpErrors.BadRequest(
          `Field selector for ${JSON.stringify(key)} must be a boolean`,
        );
      }
      projected[key] = selector;
    }
    return projected;
  }

  @get('/demo/profile')
  async getProfile(
    @param.header.string('X-Demo-User') demoUser: string | undefined,
    @param.filter(DemoProfile) filter?: Filter<DemoProfile>,
  ): Promise<Partial<DemoProfile>> {
    const actor = this.requireDemoUser(demoUser);
    const callerFields = this.validateFilter(filter);

    // Scope to the canonical actor regardless of the selected fields.
    const where = {username: actor};

    if (callerFields === undefined) {
      // Normal path: server-selected public projection.
      return this.demoProfileRepository.findOne({
        where,
        fields: DemoProfileController.PUBLIC_FIELDS,
      }) as Promise<Partial<DemoProfile>>;
    }

    // =====================================================================
    // *** INTENTIONALLY VULNERABLE: REPLACE PUBLIC PROJECTION WITH THE ***
    // *** UNRESTRICTED CLIENT PROJECTION — DO NOT "FIX" HERE ***********
    // =====================================================================
    // Passing the caller-controlled `fields` straight to the repository
    // means an exclusion selector such as {"displayName":false} returns the
    // remaining ordinary model properties — including `isAdmin` — and an
    // inclusion selector returns exactly what the client asked for. The
    // public projection is NOT merged back in. This is unsafe because the
    // complete persistence model is exposed as the read API contract. The
    // disclosure is ordinary repository projection, not a hidden-property
    // serialization bypass.
    return this.demoProfileRepository.findOne({
      where,
      fields: callerFields,
    }) as Promise<Partial<DemoProfile>>;
  }

  @patch('/demo/profile')
  async updateProfile(
    @param.header.string('X-Demo-User') demoUser: string | undefined,
    @requestBody({
      required: true,
      content: {'application/json': {schema: {}}},
    })
    body: unknown,
  ): Promise<Partial<DemoProfile>> {
    const actor = this.requireDemoUser(demoUser);

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpErrors.BadRequest('Request body must be a JSON object');
    }
    const record = body as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0) {
      throw new HttpErrors.BadRequest('Update body must not be empty');
    }

    // Build a fresh update object containing only recognized mutable
    // properties. `username` is rejected as immutable; unknown properties are
    // rejected outright.
    const changes: {email?: string; displayName?: string; isAdmin?: boolean} =
      {};
    for (const key of keys) {
      if (key === 'username') {
        throw new HttpErrors.BadRequest('username cannot be changed');
      }
      if (!DemoProfileController.MUTABLE_FIELDS.includes(key)) {
        throw new HttpErrors.BadRequest(
          `Unknown update property ${JSON.stringify(key)}`,
        );
      }
    }
    if ('email' in record) {
      const email = record.email;
      if (
        typeof email !== 'string' ||
        email.length === 0 ||
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        throw new HttpErrors.BadRequest('email must be a valid email address');
      }
      changes.email = email;
    }
    if ('displayName' in record) {
      const displayName = record.displayName;
      if (
        typeof displayName !== 'string' ||
        displayName.trim().length === 0 ||
        displayName.length > 64
      ) {
        throw new HttpErrors.BadRequest(
          'displayName must be a nonempty string of at most 64 characters',
        );
      }
      changes.displayName = displayName;
    }

    // =====================================================================
    // *** INTENTIONALLY VULNERABLE: ACCEPT MODEL-SHAPED SECURITY FIELDS ***
    // *** (isAdmin) THROUGH THE ORDINARY SELF-PROFILE UPDATE — DO NOT  ***
    // *** "FIX" HERE ****************************************************
    // =====================================================================
    // `isAdmin` is one of the recognized mutable properties above, so a
    // body of {"isAdmin":true} mass-assigns the privilege bit and persists
    // it through the ordinary update path. This is unsafe because
    // security-sensitive role attributes are accepted from an ordinary
    // self-profile update instead of a separate privileged operation.
    if ('isAdmin' in record) {
      const isAdmin = record.isAdmin;
      if (typeof isAdmin !== 'boolean') {
        throw new HttpErrors.BadRequest('isAdmin must be a boolean');
      }
      changes.isAdmin = isAdmin;
    }

    await this.demoProfileRepository.updateById(actor, changes);

    // Respond with the normal public projection so the update response does
    // not itself disclose isAdmin.
    return this.demoProfileRepository.findOne({
      where: {username: actor},
      fields: DemoProfileController.PUBLIC_FIELDS,
    }) as Promise<Partial<DemoProfile>>;
  }

  @get('/demo/admin')
  async adminOnly(
    @param.header.string('X-Demo-User') demoUser: string | undefined,
  ): Promise<{scope: string; report: string}> {
    const actor = this.requireDemoUser(demoUser);

    // Authorization is decided from the CURRENT persisted profile on every
    // request — never from a body, query, or extra header, and never cached.
    const profile = await this.demoProfileRepository.findOne({
      where: {username: actor},
    });
    if (!profile || profile.isAdmin !== true) {
      throw new HttpErrors.Forbidden('Admin access required');
    }
    return {
      scope: 'admin',
      report: 'Synthetic admin-only report',
    };
  }
}
