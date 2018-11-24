//
//  Simple HMAC Auth
//  /usage/server/express/index.js
//  Created by Jesse Youngblood on 11/21/18 at 15:14
// 

/* eslint no-console: off, no-unused-vars: off */

'use strict';

const express = require('express');
const SimpleHMACAuth = require('../../../index');

const settings = {
  port: 80,
  secretsForAPIKeys: {
    'API_KEY': 'SECRET',
    'API_KEY_TWO': 'SECRET_TWO',
    'API_KEY_THREE': 'SECRET_THREE',
  }
};

const app = express();

const auth = new SimpleHMACAuth.Server({verbose: true});

// Required. Execute callback with either an error, or an API key.
auth.secretForKey = (apiKey, callback) => {

  if (settings.secretsForAPIKeys.hasOwnProperty(apiKey)) {

    callback(null, settings.secretsForAPIKeys[apiKey]);
    return;
  }

  callback();
};

// Required. Handle requests that have failed authentication.
auth.on('rejected', ({error, request, response, next}) => {

  console.log(`Authentication failed`, error);

  response.status(401).json({
    error: error
  });

  // If you want to ignore the auth failure and permit a request anyway, you certainly can.
  //next();
});

// Optional. Log requests that have passed authentication.
auth.on('accepted', ({request}) => {
  console.log(`Authentication succeeded for request with api key "${request.apiKey}" and signature: "${request.signature}"`);
});

// Include the middleware included with the auth object
// Also include which body-parser modules to parse the request data with
// Specifying 'true' instead of an options object will use defaults
app.use(auth.middleware({
  json: true,
  urlencoded: { extended: true, limit: '10mb' },
  text: { type: 'application/octet-stream' }
}));

// Set up routes
app.all('*', (request, response) => {
  console.log(`Routing request: ${request.method} ${request.url}`);
  console.log(`Body:`, request.body);
  response.status(200).end('200');
});

// Start the server
app.listen(settings.port, () => {

  console.log(`Listening on port ${settings.port}`);
});
