import {RestApplication, RestServerConfig} from '@loopback/rest';
import {ApplicationConfig} from '@loopback/core';
import {HealthController} from './controllers/health.controller';

export class App extends RestApplication {
  constructor(options: ApplicationConfig = {}) {
    super(options);
    // Configure the server to bind to 127.0.0.1:3000
    const config: RestServerConfig = {
      host: '127.0.0.1',
      port: 3000,
    };
    this.configure('rest').to(config);
    // Register controller explicitly
    this.controller(HealthController);
  }
}

// If this file is executed directly, start the application
if (require.main === module) {
  (async () => {
    const app = new App();
    await app.start();
    console.log('Server is running at http://127.0.0.1:3000');
  })();
}
