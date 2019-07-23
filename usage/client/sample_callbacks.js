//
//  Simple HMAC Auth
//  /usage/client/sample_callbacks.js
//  Created by Jesse T Youngblood on 3/23/16 at 10:42pm
//

/* eslint no-console: off */

'use strict';

const SampleClient = require('./SampleClient');

const client = new SampleClient('API_KEY', 'SECRET', {
  verbose: true
});

const query = {
  string: 'string',
  boolean: true,
  number: 42,
  object: { populated: true },
  array: [ 1, 2, 3 ]
};

client.query(query, (error, results) => {

  if (error) {
    console.error(`Received error:`, error);
    return;
  }

  console.log(results);
});
