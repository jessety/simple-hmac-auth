//
//  Simple HMAC Auth
//  /usage/server/http/index.js
//  Created by Jesse Youngblood on 11/23/18 at 20:03
// 

/* eslint no-console: off, no-unused-vars: off */

'use strict';

const http = require('http');
const SimpleHMACAuth = require('../../../index');

const settings = {
  port: 8000,
  secretsForAPIKeys: {
    'API_KEY': 'SECRET',
    'API_KEY_TWO': 'SECRET_TWO',
    'API_KEY_THREE': 'SECRET_THREE',
  }
};

const auth = new SimpleHMACAuth.Server({verbose: true});

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
  
  console.log(`Processing new request:`, new Date());

  try {

    const { apiKey, signature } = await auth.authenticate(request, true);
    
    console.log(`  Authentication passed for request with API key "${apiKey}" and signature "${signature}".`);

    response.writeHead(200);
    response.end('200');

  } catch (error) {
    
    console.log(`  Authentication failed`, error);

    response.writeHead(401);
    response.end(JSON.stringify({error}));
  }

}).listen(settings.port);

console.log(`Listening on port ${settings.port}`);
