//
//  Simple HMAC Auth
//  /examples/server/index.js
//  Created by Jesse Youngblood on 11/23/18 at 20:03
//

/* eslint no-console: off, no-unused-vars: off */

'use strict';

const http = require('http');
const SimpleHMACAuth = require('../../src/index');

const settings = {
  port: 8000,
  secretsForAPIKeys: {
    API_KEY: 'SECRET',
    API_KEY_TWO: 'SECRET_TWO',
    API_KEY_THREE: 'SECRET_THREE'
  }
};

const auth = new SimpleHMACAuth.Server({ verbose: true });

// Required. Execute callback with either an error, or an API key.
auth.secretForKey = (apiKey, callback) => {

  if (settings.secretsForAPIKeys.hasOwnProperty(apiKey)) {

    callback(null, settings.secretsForAPIKeys[apiKey]);
    return;
  }

  callback();
};

// Create HTTP server
http.createServer(async (request, response) => {

  console.log(`Processing new request`, new Date());

  try {

    // Sending 'true' as the 2nd parameter instead of the raw request body instructs simple-hmac-auth to handle the body itself
    const { apiKey, signature } = await auth.authenticate(request, true);

    console.log(`  Authentication successful. API Key "${apiKey}" signature "${signature}": ${request.method} ${request.url}`);
    if (request.body) {
      console.log(`  Body: ${request.body}`);
    }

    response.writeHead(200);
    response.end('200');

  } catch (error) {

    console.log(`  Authentication failed: ${request.method} ${request.url}`, error);

    response.setHeader('Content-Type', 'application/json');
    response.writeHead(401);
    response.end(JSON.stringify({
      error: {
        message: error.message
      }
    }));
  }

}).listen(settings.port);

console.log(`Listening on port ${settings.port}`);
