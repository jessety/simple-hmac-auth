//
//  Simple HMAC Auth
//  Direct, non-subclassed usage of the Client class
//  /examples/client/direct/promises.js
//  Created by Jesse T Youngblood on 11/23/18 at 19:23
//

/* eslint no-console: off */

'use strict';

const SimpleHMACAuth = require('../../../lib/index');

const client = new SimpleHMACAuth.Client('API_KEY', 'SECRET', {
  host: 'localhost',
  port: 8000,
  ssl: false,
  verbose: true
});

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
  data: {
    string: 'string',
    boolean: true,
    number: 42,
    object: { populated: true },
    array: [ 1, 2, 3 ]
  }
};

client.request(options).then(results => {

  console.log(results);

}).catch(error => {

  console.log(`Received error:`, error);
});
