//
//  Simple HMAC Auth
//  /usage/client/sample_async.js
//  Created by Jesse T Youngblood on 11/23/18 at 19:15
//    

/* eslint no-console: off */

'use strict';

const SampleClient = require('./SampleClient');

(async () => {

  const client = new SampleClient('API_KEY', 'SECRET', {
    verbose: true
  });

  try {

    const query = {
      string: 'string',
      boolean: true,
      number: 42,
      object: { populated: true },
      array: [1, 2, 3]
    };

    const results = await client.query(query);

    console.log(results);

  } catch (error) {

    console.log(`Received error:`, error);
  }

})();
