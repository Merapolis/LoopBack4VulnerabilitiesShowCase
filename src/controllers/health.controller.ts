import {get} from '@loopback/rest';

export class HealthController {
  @get('/ping')
  ping(): object {
    return {status: 'ok'};
  }
}
