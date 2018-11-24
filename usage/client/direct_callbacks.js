//
//  Simple HMAC Auth
//  Direct, non-subclassed usage of the Client class
//  /usage/client/direct_callbacks.js
//  Created by Jesse T Youngblood on 11/23/18 at 19:23
//    

/* eslint no-console: off */

'use strict';

const SimpleHMACAuth = require('../../index');

const client = new SimpleHMACAuth.Client('API_KEY', 'SECRET', {
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

client.request(options, (error, results) => {

  if (error) {
    console.error(`Received error:`, error);
    return;
  }

  console.log(results);
});
