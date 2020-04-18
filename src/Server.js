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
   * @param {number}   [settings.bodySizeLimit=10]             Default size limit for request body parsing, in megabytes
   */
  constructor(settings) {

    if (settings === undefined) {
      settings = {};
    }

    if (typeof settings.verbose !== 'boolean') {
      settings.verbose = false;
    }

    if (!settings.hasOwnProperty('secretForKeyTimeout') || typeof settings.secretForKeyTimeout !== 'number') {

      settings.secretForKeyTimeout = 10 * 1000; // 10 seconds
    }

    if (!settings.hasOwnProperty('permittedTimestampSkew') || typeof settings.permittedTimestampSkew !== 'number') {

      settings.permittedTimestampSkew = 60 * 1000; // 60 seconds
    }

    if (!settings.hasOwnProperty('bodySizeLimit') || typeof settings.bodySizeLimit !== 'number') {

      settings.bodySizeLimit = 10;
    }

    settings.bodySizeLimitBytes = settings.bodySizeLimit * 1000000;

    if (typeof settings.secretForKey === 'function') {

      this.secretForKey = settings.secretForKey;
    }

    this.settings = settings;
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

        if (error === undefined) {

          reject(new AuthError(`Internal failure while attempting to locate secret for API key "${apiKey}"`, `INTERNAL_ERROR_SECRET_DISCOVERY`));
          return;
        }

        if (error.code === undefined) {
          error.code = 'INTERNAL_ERROR_SECRET_DISCOVERY';
        }

        reject(error);
        return;
      }

      if (secret === undefined) {

        reject(new AuthError(`Unrecognized API key: ${apiKey}`, `API_KEY_UNRECOGNIZED`));
        return;
      }

      request.secret = secret;

      if (!request.headers.hasOwnProperty('signature')) {

        reject(new AuthError(`Missing signature. Please sign all incoming requests with the 'signature' header.`, `SIGNATURE_HEADER_MISSING`));
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

      const [ protocol, algorithm, signature ] = signatureComponents;

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
   * The server might have implemented this using callbacks, promises, or just return a string - so try all 3 approaches.
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
        return;
      }

      // Give up after a certain amount of time.
      // This is to prevent situations where connections are left hanging when the client's secretForKey function has stalled
      const timer = setTimeout(() => {

        reject(new AuthError(`Internal failure while attempting to locate secret for API key "${apiKey}": secretForKey has timed out after ${(this.settings.secretForKeyTimeout / 1000)} seconds`, `INTERNAL_ERROR_SECRET_TIMEOUT`));

      }, this.settings.secretForKeyTimeout);


      // Check if this function expects a callback
      if (this.secretForKey.length === 2) {

        const callback = (error, secret) => {

          clearTimeout(timer);

          if (error || secret === undefined) {
            reject(error);
            return;
          }

          resolve(secret);
        };

        this.secretForKey(apiKey, callback);
        return;
      }

      const returnValue = this.secretForKey(apiKey);

      if (returnValue instanceof Promise) {

        returnValue.then(secret => {

          clearTimeout(timer);
          resolve(secret);

        }).catch(error => {

          clearTimeout(timer);
          reject(error);
        });

        return;
      }

      // If the secretForKey function does not accept a callback and the return value was not a promise,
      // --assume that the resulting value is the return
      resolve(returnValue);
    });
  }

  /**
   * Extract the raw body data from a request
   * @private
   * @param   {object} request - An HTTP request
   * @returns {Promise} A promise that will resolve with the raw body of the request, or a blank string
   */
  _rawBodyForRequest(request) {

    return new Promise((resolve, reject) => {

      if (request.rawBody !== undefined && request.rawBody !== null) {
        resolve(request.rawBody);
        return;
      }

      const { bodySizeLimit, bodySizeLimitBytes } = this.settings;

      const chunks = [];

      request.on('data', chunk => {

        chunks.push(chunk);

        if (Buffer.concat(chunks).byteLength >= bodySizeLimitBytes) {
          const error = new Error(`Maximum file length (${bodySizeLimit}mb) exceeded.`);
          error.code = 'ETOOLONG';
          reject(error);
        }
      });

      request.on('end', () => {
        resolve(Buffer.concat(chunks).toString());
      });
    });
  }
}

module.exports = SimpleHMACAuth;
