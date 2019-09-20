//
//  Simple HMAC Auth
//  Direct, non-subclassed usage of the Client class
//  /examples/client/direct/promises_async.js
//  Created by Jesse T Youngblood on 8/13/18 at 18:50
//

/* eslint no-console: off */

'use strict';

const SimpleHMACAuth = require('../../../src/index');

const client = new SimpleHMACAuth.Client('API_KEY', 'SECRET', {
  host: 'localhost',
  port: 8000,
  ssl: false,
  verbose: true,
  options: {
    rejectUnauthorized: false
  },
  headers: {
    'x-class-wide-header': 'test-123'
  }
});

(async () => {

  try {

    const options = {
      method: 'POST',
      path: '/items/',
      query: {
        string: 'string',
        boolean: true,
        number: 42,
        object: { populated: true },
        array: [ 1, 2, 3 ]
      },
      data: '<xml><test>true</test></xml>',
      headers: {
        'content-type': 'text/xml',
        'x-custom-header': 'header value'
      }
    };

    const results = await client.request(options);

    console.log(results);

  } catch (error) {

    console.log(`Received error:`, error);
  }

})();
