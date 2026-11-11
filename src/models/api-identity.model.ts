import {Entity, model, property} from '@loopback/repository';

/**
 * ApiIdentity is a synthetic API-access abstraction used only by the
 * deliberately vulnerable demonstration on the `demo/wildcard-oracle`
 * branch. It is NOT a login, session, password, or user-management system.
 *
 * The seeded values (BLOG, SAFE) are fixed educational fixtures chosen to
 * make reproducible testing possible; they are not production credentials.
 */
@model({
  name: 'ApiIdentity',
})
export class ApiIdentity extends Entity {
  @property({
    type: 'string',
    id: true,
    // Not generated: ownerId is the caller-supplied primary key.
    generated: false,
    required: true,
  })
  ownerId!: string;

  @property({
    type: 'string',
    required: true,
    // Secret: excluded from serialized responses wherever supported
    // (juggler hiddenProperties / toJSON). No endpoint may ever return it.
    hidden: true,
    // Documentation only (OpenAPI); repository validation is unchanged.
    jsonSchema: {
      type: 'string',
      minLength: 4,
      maxLength: 4,
      pattern: '^[A-Z]{4}$',
    },
  })
  accessId!: string;
}
