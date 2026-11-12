import {Entity, model, property} from '@loopback/repository';

/**
 * ProtectedValue is a synthetic protected resource used only by the
 * deliberately vulnerable projection demo on branch
 * `demo/projection-fail-open`. It is separate from the Document domain.
 *
 * `secretId` is the caller-supplied primary key (not generated); `owner` is
 * the fixture owner (alice or bob); `value` is the synthetic protected value.
 * All seeded data is fictional.
 */
@model({
  name: 'ProtectedValue',
})
export class ProtectedValue extends Entity {
  @property({
    type: 'string',
    id: true,
    // Not generated: secretId is the caller-supplied primary key.
    generated: false,
    required: true,
  })
  secretId!: string;

  @property({
    type: 'string',
    required: true,
  })
  owner!: string;

  @property({
    type: 'string',
    required: true,
  })
  value!: string;
}
