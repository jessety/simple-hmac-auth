//
//  Simple HMAC Auth
//  /src/Server.js
//  Created by Jesse T Youngblood on 3/24/16 at 2:29pm 
//    

'use strict';

const url = require('url');
const querystring = require('querystring');

const { sign, algorithms } = require('./sign');
const canonicalize = require('./canonicalize');
const AuthError = require('./AuthError');

class SimpleHMACAuth {

  /**
   * Instantiate a new authentication object
   * @param {object}   [settings]
   * @param {function} [settings.secretForKey]                 Delegate function called to retrieve the secret for an API key
   * @param {boolean}  [settings.verbose=false]                If true, log debug information to the console
   * @param {number}   [settings.secretForKeyTimeout=10000]    How long until timing out on the secretForKey function
   * @param {number}   [settings.permittedTimestampSkew=60000] How far away from the current time to allow requests from
   * @param {string}   [settings.bodySizeLimit='5mb']          Default size limit for request body parsing
   */
  constructor(settings) {

    if (settings === undefined) {
      settings = {};
    }

    if (!settings.hasOwnProperty('verbose')) {
      settings.verbose = false;
    }

    if (!settings.hasOwnProperty('secretForKeyTimeout') || typeof settings.secretForKeyTimeout !== 'number') {

      settings.secretForKeyTimeout = 10 * 1000; // 10 seconds
    }

    if (!settings.hasOwnProperty('permittedTimestampSkew') || typeof settings.permittedTimestampSkew !== 'number') {

      settings.permittedTimestampSkew = 60 * 1000; // 10 seconds
    }

    if (!settings.hasOwnProperty('bodySizeLimit') || typeof settings.bodySizeLimit !== 'string') {

      settings.bodySizeLimit = '5mb';
    }

    if (typeof settings.secretForKey === 'function') {

      this.secretForKey = settings.secretForKey;
    }

    this.settings = settings;
  }

  /**
   * Log debug messages to the console, if 'verbose' is enabled.
   */
  log(...messages) {

    if (!this.settings.verbose) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`SimpleHMACAuth`, ...messages);
  }

  /**
   * Authenticate a request
   * @param   {object}  request - An HTTP request
   * @param   {object}  data - Body data for the request
   * @returns {Promise} - Promise that resolves if the request authenticates, or rejects if it is not
   */
  async authenticate(request, data) {

    return new Promise(async (resolve, reject) => {

      // Let's just assume the worst until we have reason to believe otherwise
      request.authenticated = false;

      // Make sure we have the full raw body of a request

      // If instead of including a body (or omitting one) 'true' is sent, manually process the raw body for this request.
      if (data === true) {

        try {

          data = await this._rawBodyForRequest(request);

          request.body = data;

        } catch (e) {

          reject(e);
        }
      }

      // Pull the API key from the request
      const apiKey = this._apiKeyForRequest(request);

      if (apiKey === undefined) {

        reject(new AuthError(`Missing API Key`, `API_KEY_MISSING`));
        return;
      }

      request.apiKey = apiKey;

      let secret;
      try {

        secret = await this._secretForKey(apiKey);

      } catch (error) {

        this.log(`Failed to load secret for API key "${apiKey}"`);

        if (error === undefined) {

          reject(new AuthError(`Internal failure while attempting to locate secret for API key "${apiKey}"`, `INTERNAL_ERROR_SECRET_DISCOVERY`));
          return;
        }

        reject(error);
        return;
      }

      if (secret === undefined) {

        reject(new AuthError(`Unrecognized API key: ${apiKey}`, `API_KEY_UNRECOGNIZED`));
        return;
      }

      request.secret = secret;

      if (!request.headers.hasOwnProperty('authorization')) {

        reject(new AuthError(`Missing authorization. Please sign all incoming requests with the 'authorization' header.`, `AUTHORIZATION_HEADER_MISSING`));
        return;
      }

      if (!request.headers.hasOwnProperty('date')) {

        reject(new AuthError(`Missing timestamp. Please timestamp all incoming requests by including 'date' header.`, `DATE_HEADER_MISSING`));
        return;
      }

      // First, confirm that the 'date' header is recent enough
      const requestTime = new Date(request.headers.date);
      const now = new Date();

      // If this request was made over [60] seconds ago, ignore it
      if (now - requestTime > this.settings.permittedTimestampSkew) {

        const error = new AuthError(`Timestamp is too old. Recieved: "${request.headers.date}" current time: "${now.toUTCString()}"`, `DATE_HEADER_INVALID`);
        error.time = now.toUTCString();
        reject(error);
        return;
      }

      // Great! It looks like this is a recent request, and probably not a replay attack.
      // We expect the signature header to contain a string like this:
      // 'simple-hmac-auth sha256 148c033512ad0c90e95ede5166089dcdf3b6c3b1b31da150e51484984300dcf2'

      const signatureComponents = request.headers.signature.split(' ');

      if (signatureComponents.length < 3) {

        const error = new AuthError(`Signature header is improperly formatted: "${request.headers.signature}"`, `SIGNATURE_HEADER_INVALID`);
        error.details = `It should look like: "simple-hmac-auth sha256 a42d7b09a929b997aa8e6973bdbd5ca94326cbffc3d06a557d9ed36c6b80d4ff"`;

        reject(error);
        return;
      }

      const protocol = signatureComponents[0];
      const algorithm = signatureComponents[1];
      const signature = signatureComponents[2];

      if (protocol !== 'simple-hmac-auth') {

        const error = new AuthError(`Signature header included unsupported protocol version: "${protocol}". Ensure the client and server are using the latest signature library.`, `SIGNATURE_HEADER_INVALID`);

        error.details = `Expected "simple-hmac-auth"`;

        reject(error);
        return;
      }

      if (!algorithms.includes(algorithm)) {

        reject(new AuthError(`Authorization header send invalid algorithm: "${algorithm}". The only supported hmac algorithms are: "${algorithms.join('", "')}"`, `HMAC_ALGORITHM_INVALID`));
        return;
      }

      const requestURL = url.parse(request.url);

      const canonical = canonicalize(request.method, requestURL.pathname, requestURL.query, request.headers, data);

      const calculatedSignature = sign(canonical, secret, algorithm);

      request.signature = calculatedSignature;
      request.signatureExpected = calculatedSignature;

      if (signature !== calculatedSignature) {

        reject(new AuthError(`Signature is invalid.`, `SIGNATURE_INVALID`));
        return;
      }

      // It worked!
      request.authenticated = true;

      resolve({ apiKey, secret, signature });
    });
  }

  /**
   * Extract the API key from a request
   * @private
   * @param   {object} request - An HTTP request
   * @returns {string} API Key, if included
   */
  _apiKeyForRequest(request) {

    let apiKey;

    if (request.headers.hasOwnProperty('authorization')) {

      // The authorization header should look like this: 
      // api-key sampleKey
      const components = request.headers.authorization.split(' ');

      if (components.length > 1) {
        apiKey = components[1];
      }

    } else {

      let query = {};

      if (request.hasOwnProperty('query')) {

        query = request.query;

      } else {

        query = querystring.parse(url.parse(request.url).query);
      }

      if (query.apiKey !== undefined) {

        apiKey = query.apiKey;
      }
    }

    return apiKey;
  }

  /**
   * Retrieve the secret for an API key we got.
   * The server might have implemented this using callbacks or promises, so try both.
   * @private
   * @param   {string}  apiKey API key we received from the client
   * @returns {Promise} Promise that we got a secret for that API key from userland
   */
  _secretForKey(apiKey) {

    return new Promise((resolve, reject) => {

      if (typeof this.secretForKey !== 'function') {

        const error = new AuthError(`Missing secretForKey function`);
        error.details = `Please implement a 'secretForKey' delegate function`;

        reject(error);
      }

      // Give up after a certain amount of time. 
      // This is to prevent situations where connections are left hanging when the client's secretForKey function has stalled
      const timer = setTimeout(() => {

        reject(new AuthError(`Internal failure while attempting to locate secret for API key "${apiKey}": secretForKey has timed out after ${(this.settings.secretForKeyTimeout / 1000)} seconds`, `INTERNAL_ERROR_SECRET_TIMEOUT`));

      }, this.settings.secretForKeyTimeout);

      const callback = (error, secret) => {

        clearTimeout(timer);

        if (error || secret === undefined) {
          reject(error);
          return;
        }

        resolve(secret);
      };

      const possiblePromise = this.secretForKey(apiKey, callback);

      if (possiblePromise instanceof Promise) {

        possiblePromise.then(secret => {

          clearTimeout(timer);
          resolve(secret);

        }).catch(error => {

          clearTimeout(timer);
          reject(error);
        });
      }
    });
  }

  /**
   * Extract the raw body data from a request
   * @private
   * @param   {object} request - An HTTP request
   * @returns {Promise} A promise that will resolve with the raw body of the request, or a blank string
   */
  _rawBodyForRequest(request) {

    return new Promise(resolve => {

      if (request.rawBody !== undefined && request.rawBody !== null) {
        resolve(request.rawBody);
        return;
      }

      let data = '';

      request.on('data', chunk => {
        data += chunk.toString();
      });

      request.on('end', () => {
        resolve(data);
      });
    });
  }
}

module.exports = SimpleHMACAuth;
