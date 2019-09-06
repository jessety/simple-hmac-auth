//
//  Simple HMAC Auth
//  Direct, non-subclassed usage of the Client class
//  /examples/client/direct_callbacks.js
//  Created by Jesse T Youngblood on 5/31/19 at 11:15
//

/* eslint no-console: off */

'use strict';

const SimpleHMACAuth = require('../../index');

const client = new SimpleHMACAuth.Client('API_KEY', 'SECRET', {
  host: 'localhost',
  port: 8000,
  ssl: false,
  verbose: true
});

const options = {
  method: 'GET',
  path: '/items/',
  query: {
    string: 'string',
    boolean: true,
    number: 42,
    object: { populated: true },
    array: [ 1, 2, 3 ]
  }
};

client.request(options, (error, results) => {

  if (error) {
    console.error(`Received error:`, error);
    return;
  }

  console.log(results);
});
