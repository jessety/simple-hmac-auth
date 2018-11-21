//
//  middleware.js
//  Created by Jesse T Youngblood on 3/24/16 at 2:29pm 
//    

'use strict';

const url = require('url');
const sign = require('./sign.js');
const colors = require('./colors.js');

class EasySigning {

  constructor(settings) {

    if (settings === undefined) {
      settings = {};
    }

    if (!settings.hasOwnProperty('verbose')) {
      settings.verbose = false;
    }

    this.settings = settings;

    this.log(`Hello!`);
  }

  log(...messages) {

    if (!this.settings.verbose) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log(colors.blue(`EasySigning`), ...messages);
  }

  error(...messages) {

    if (!this.settings.verbose) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log(colors.blue(`EasySigning`), colors.red(`Error:`), ...messages);
  }

  middleware() {

    // Middleware to preserve the raw body of the request.
    const rawBody = (request, response, next) => {

      request.rawBody = '';

      request.on('data', chunk => { 
        request.rawBody += chunk;
      });

      request.on('end', () => {
        next();
      });
    };

    const apiKey = (request, response, next) => {

      let apiKey;

      if (request.headers.hasOwnProperty('x-api-key')) {
        apiKey = request.headers['x-api-key'];
      }

      if (request.query.hasOwnProperty('apiKey')) {
        apiKey = request.query.apiKey;
      }

      if (apiKey !== undefined) {
        request.apiKey = apiKey;
      }

      next();
    }

    // Register all middleware 
    return [(...parameters) => {
      rawBody(...parameters);
    }, (...parameters) => {
      apiKey(...parameters);
    }, (...parameters) => {
      this.validate(...parameters);
    }];
  }

  async validate(request, response, next) {

    // Let's just assume the worst until we have reason to believe otherwise
    request.authenticated = false;

    const apiKey = request.apiKey;

    if (apiKey === undefined) {
      this.reject(null, {
        message: 'Missing API Key',
        code: 'MISSING_API_KEY'
      }, request, response, next);
      return;
    }

    let secret;
    try {
      secret = await this._retrieveSecretForKey(apiKey);
    } catch (e) {
      //this.log(`Caught exception loading secret for API key ${apiKey}:`, e);
    }

    if (secret === undefined) {
      this.reject(null, {
        message: 'API key is not recognized',
        code: 'INVALID_API_KEY'
      }, request, response, next);
      return;
    }

    this.log(`Found secret for API key ${apiKey}`);

    if (!request.headers.hasOwnProperty('authorization')) {
      this.log('Missing authorization header.');
      this.reject(null, {
        message: 'Missing authorization. Please sign all incoming requests with the \'authorization\' header.',
        code: 'MISSING_AUTHORIZATION_HEADER'
      }, request, response, next);
      return;
    }

    if (!request.headers.hasOwnProperty('date')) {
      this.log('Missing date header.');
      this.reject(null, {
        message: 'Missing timestamp. Please timestamp all incoming requests by including \'date\' header.',
        code: 'MISSING_DATE_HEADER'
      }, request, response, next);
      return;
    }

    // First, confirm that the 'date' header is actually a date from the last fifteen minutes
    const requestTime = new Date(request.headers.date);
    const now = new Date();

    // If this request was made over fifteen minutes ago, we just don't want to deal with it.
    if (now - requestTime > (60 * 15 * 1000)) {

      this.reject(null, {
        message: 'Timestamp is too old. Recieved: "' + request.headers.date + '" current time: "' + now.toUTCString() + '"',
        code: 'INVALID_DATE',
        time: now.toUTCString()
      }, request, response, next);
      return;
    }

    // Great! It looks like this is a recent request, and probably not a replay attack.
    // We expect the authorization header to contain a string like this: 'signature hwbjmsdfakdj31newfdnn'

    const authorizationComponents = request.headers.authorization.split(' ');

    if (authorizationComponents.length < 2) {

      this.reject(null, {
        message: 'Authorization header is improperly formatted: ' + request.headers.authorization,
        code: 'INVALID_AUTHORIZATION_HEADER',
      }, request, response, next);
      return;
    }

    const signature = authorizationComponents[1];

    const calculatedSignature = this.signRequest(request, secret);

    if (signature !== calculatedSignature) {

      this.reject(null, {
        message: 'Signature is invalid.',
        code: 'INVALID_SIGNATURE'
      }, request, response, next);
      return;
    }

    // It worked!

    request.authenticated = true;

    next();
  }

  _retrieveSecretForKey(apiKey) {

    return new Promise((resolve, reject) => {

      if (typeof this.secretForKey !== 'function') {
        this.error(`EasySigning missing 'secretForKey' delegate function.`);
        reject({
          message: `Missing secretForKey function`,
          details: `Please implement a 'secretForKey' delegate for the EasySigning module.`
        });
        return;
      }

      const callback = (error, secret) => {

        if (error || secret === undefined) {
          reject(error);
          return;
        }

        resolve(secret);
      };

      const possiblePromise = this.secretForKey(apiKey, callback);

      if (possiblePromise instanceof Promise) {

        possiblePromise.then(secret => {

          resolve(secret);

        }).catch(error => {

          reject(error);
        });
      }
    });
  }

  reject(error, userError, request, response, next) {

    if (error) {

      if (typeof this.onError !== 'function') {
        this.error(`Missing 'onError' function`);
        return;
      }

      this.onError(error, request, response, next);
    }

    if (userError) {

      if (typeof this.authenticationFailed !== 'function') {
        this.error(`Missing 'authenticationFailed' function`);
        return;
      }

      this.authenticationFailed(userError, request, response, next);
    }
  }

  signRequest(request, secret) {

    const parsedUrl = url.parse(request.url);

    const method = request.method;
    const path = parsedUrl.pathname; // Remove the GET path from the URL
    const bodyData = request.rawBody;

    // Remove the signature header, but use everything else
    const headerKeys = Object.keys(request.headers);
    const headers = {};

    headerKeys.forEach((key) => {

      if (['authorization', 'host', 'connection', 'x-forwarded-for'].indexOf(key) !== -1) {
        return;
      }

      headers[key] = request.headers[key];
    });

    let queryString = parsedUrl.query;

    if (queryString === null) {
      queryString = '';
    }

    return sign(secret, method, path, queryString, headers, bodyData);
  }
}

module.exports = EasySigning;
