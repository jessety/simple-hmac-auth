//
//  Simple HMAC Auth
//  /usage/server/express_roundtrip/index.js
//  Created by Jesse Youngblood on 11/23/18 at 19:31
// 

/* eslint no-console: off, no-unused-vars: off */

'use strict';

const express = require('express');
const SimpleHMACAuth = require('../../../index');

const settings = {
  port: 8000,
  secretsForAPIKeys: {
    'API_KEY': 'SECRET',
    'API_KEY_TWO': 'SECRET_TWO',
    'API_KEY_THREE': 'SECRET_THREE'
  }
};

const app = express();

// Required. Execute callback with either an error, or an API key.
const secretForKey = (apiKey, callback) => {

  if (settings.secretsForAPIKeys.hasOwnProperty(apiKey)) {

    callback(null, settings.secretsForAPIKeys[apiKey]);
    return;
  }

  callback();
};

// Required. Handle requests that have failed authentication.
const onRejected = (error, request, response, next) => {

  console.log(`Authentication failed`, error);

  response.status(401).json({
    error: {
      message: error.message
    }
  });

  // If you want to ignore the auth failure and permit a request anyway, you certainly can.
  //next();
};

// Optional. Log requests that have passed authentication.
const onAccepted = (request, response) => {
  console.log(`Authentication succeeded for request with api key "${request.apiKey}" and signature: "${request.signature}"`);
};

// Register authentication middleware 
// Also include which body-parser modules to parse the request data with
// Specifying 'true' instead of an options object will use defaults
app.use(SimpleHMACAuth.middleware({

  // Required
  secretForKey: secretForKey,
  onRejected: onRejected, 

  // Optional
  onAccepted: onAccepted,

  // Body-parser options. All optional.
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
const server = app.listen(settings.port, () => {

  console.log(`Listening!`);

  // Create a client and make a request

  const client = new SimpleHMACAuth.Client('API_KEY', 'SECRET', {
    verbose: true,
    host: 'localhost',
    port: settings.port,
    ssl: false
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

  console.log(`Client sending request..`);

  client.request(options).then(response => {

    console.error(`Client response:`, response);
    server.close();

  }).catch(error => {

    console.error(`Client error:`, error);
    //server.close();
  });
});
