import {Entity, model, property} from '@loopback/repository';

/**
 * DemoProfile is a synthetic user profile used only by the deliberately
 * vulnerable profile-field-authorization demo on branch
 * `demo/profile-field-authorization`.
 *
 * Note: `isAdmin` is an ordinary persisted boolean property. It is NOT marked
 * `hidden`, `protected`, `readonly`, or `immutable`. It is merely omitted from
 * the normal profile response by a server-side field projection.
 */
@model({
  name: 'DemoProfile',
})
export class DemoProfile extends Entity {
  @property({
    type: 'string',
    id: true,
    // Not generated: username is the caller-supplied primary key.
    generated: false,
    required: true,
  })
  username!: string;

  @property({
    type: 'string',
    required: true,
  })
  email!: string;

  @property({
    type: 'string',
    required: true,
  })
  displayName!: string;

  @property({
    type: 'boolean',
    required: true,
  })
  isAdmin!: boolean;
}
