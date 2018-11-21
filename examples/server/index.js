//
//  examples/server/index.js
//  Created by Jesse Youngblood on 11/21/18 at 15:14
// 

// eslint-disable no-console

'use strict';

const express = require('express');
const { EasySigning } = require('../../index');

const settings = require('./settings');

const app = express();
const auth = new EasySigning({verbose: true});

auth.secretForKey = (apiKey, callback) => {

  console.log(`Authentication module is requesting the secret for API key ${apiKey}`);

  if (settings.secretsForAPIKeys.hasOwnProperty(apiKey)) {

    callback(null, settings.secretsForAPIKeys[apiKey]);
    return;
  }

  callback();
};

// For errors caused by configuration problems
auth.onError = (error, request, response, next) => {

  response.status(500).json({
    error: error
  });
};

// For authentication failures
auth.authenticationFailed = (error, request, response, next) => {

  console.log(`Authentication failed for request`, error);

  response.status(400).json({
    error: error
  });

  // If you want to ignore the auth failure and permit a request, you certainly can.
  //next();
};

app.use(auth.middleware());

// Start the server
app.listen(80, () => {

  console.log(`Listening on port ${settings.port}`);
});
