//
//  Simple HMAC Auth
//  /examples/client/sample_promises.js
//  Created by Jesse T Youngblood on 11/23/18 at 19:14
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

client.query(query).then(results => {

  console.log(results);

}).catch(error => {

  console.log(`Received error:`, error);
});
