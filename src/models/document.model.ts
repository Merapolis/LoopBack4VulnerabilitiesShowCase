import {Entity, model, property} from '@loopback/repository';

@model({
  name: 'Document',
})
export class Document extends Entity {
  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  @property({
    type: 'string',
    required: true,
  })
  title!: string;

  @property({
    type: 'string',
    required: true,
  })
  content!: string;

  @property({
    type: 'string',
    required: true,
  })
  ownerId!: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['public', 'private'],
    },
  })
  visibility!: string;

}
