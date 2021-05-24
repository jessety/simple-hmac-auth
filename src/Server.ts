//
//  Simple HMAC Auth
//  /src/Server.js
//  Created by Jesse T Youngblood on 3/24/16 at 2:29pm
//

import url from 'url';
import http from 'http';
import querystring from 'querystring';

import { sign, algorithms } from './sign';
import canonicalize from './canonicalize';
import AuthError from './AuthError';

interface SimpleHMACAuthOptions {
  verbose: boolean
  secretForKeyTimeout: number
  permittedTimestampSkew: number
  bodySizeLimit: number
  bodySizeLimitBytes: number
  secretForKey: SecretForKeyFunction
}

// The SecretForKey function may return secrets directly, resolve a promise with the secret, or execute a callback
type SecretKeyReturnFunction = (key: string) => string | undefined;
type SecretKeyPromiseFunction = (key: string) => Promise<string>;
type SecretKeyCallbackFunction = (key: string, callback: ((error: Error) => void) | ((error: undefined, secret: string) => void)) => void;

type SecretForKeyFunction = SecretKeyReturnFunction | SecretKeyPromiseFunction | SecretKeyCallbackFunction;

class ExtendedError extends Error {
  code?: string;
  [key: string]: string | undefined
}

class SimpleHMACAuth {

  options: SimpleHMACAuthOptions

  secretForKey?: SecretForKeyFunction

  /**
   * Instantiate a new authentication object
   * @param {object}   [settings]
   * @param {function} [settings.secretForKey]                 Delegate function called to retrieve the secret for an API key
   * @param {boolean}  [settings.verbose=false]                If true, log debug information to the console
   * @param {number}   [settings.secretForKeyTimeout=10000]    How long until timing out on the secretForKey function
   * @param {number}   [settings.permittedTimestampSkew=60000] How far away from the current time to allow requests from
   * @param {number}   [settings.bodySizeLimit=10]             Default size limit for request body parsing, in megabytes
   */
  constructor(options?: Partial<SimpleHMACAuthOptions>) {

    if (options === undefined) {
      options = {};
    }

    if (typeof options.verbose !== 'boolean') {
      options.verbose = false;
    }

    if (typeof options.secretForKeyTimeout !== 'number') {

      options.secretForKeyTimeout = 10 * 1000; // 10 seconds
    }

    if (typeof options.permittedTimestampSkew !== 'number') {

      options.permittedTimestampSkew = 60 * 1000; // 60 seconds
    }

    if (typeof options.bodySizeLimit !== 'number') {

      options.bodySizeLimit = 10;
    }

    options.bodySizeLimitBytes = options.bodySizeLimit * 1000000;

    if (typeof options.secretForKey === 'function') {

      this.secretForKey = options.secretForKey;
    }

    this.options = options as SimpleHMACAuthOptions;
  }

  /**
   * Authenticate a request
   * @param   {object}  request - An HTTP request
   * @param   {object}  data - Body data for the request
   * @returns {Promise} - Promise that resolves if the request authenticates, or rejects if it is not
   */
  async authenticate(request: http.IncomingMessage, data: string | true): Promise<{apiKey: string, secret: string, signature: string}> {
    // Let's just assume the worst until we have reason to believe otherwise
    (request as any).authenticated = false;

    // Make sure we have the full raw body of a request

    // If instead of including a body (or omitting one) 'true' is sent, manually process the raw body for this request.
    if (data === true) {

      data = await this._rawBodyForRequest(request).catch(error => {
        throw error;
      });

      (request as any).body = data;
    }

    // Pull the API key from the request
    const apiKey = this._apiKeyForRequest(request);

    if (apiKey === undefined) {

      throw new AuthError(`Missing API Key`, `API_KEY_MISSING`);
    }

    (request as any).apiKey = apiKey;

    let secret;
    try {

      secret = await this._secretForKey(apiKey);

    } catch (error) {

      if (error === undefined) {

        throw new AuthError(`Internal failure while attempting to locate secret for API key "${apiKey}"`, `INTERNAL_ERROR_SECRET_DISCOVERY`);
      }

      if (error.code === undefined) {
        error.code = 'INTERNAL_ERROR_SECRET_DISCOVERY';
      }

      throw error;
    }

    if (secret === undefined) {

      throw new AuthError(`Unrecognized API key: ${apiKey}`, `API_KEY_UNRECOGNIZED`);
    }

    (request as any).secret = secret;

    if (request.headers.signature === undefined) {

      throw new AuthError(`Missing signature. Please sign all incoming requests with the 'signature' header.`, `SIGNATURE_HEADER_MISSING`);
    }

    if (request.headers.date === undefined) {

      throw new AuthError(`Missing timestamp. Please timestamp all incoming requests by including 'date' header.`, `DATE_HEADER_MISSING`);
    }

    // First, confirm that the 'date' header is recent enough
    const requestTime = new Date(request.headers.date);
    const now = new Date();

    // If this request was made over [60] seconds ago, ignore it
    if ((now.getTime() / 1000) - (requestTime.getTime() / 1000) > (this.options.permittedTimestampSkew / 1000)) {

      const error = new AuthError(`Timestamp is too old. Recieved: "${request.headers.date}" current time: "${now.toUTCString()}"`, `DATE_HEADER_INVALID`);
      error.time = now.toUTCString();

      throw error;
    }

    // Great! It looks like this is a recent request, and probably not a replay attack.
    // We expect the signature header to contain a string like this:
    // 'simple-hmac-auth sha256 148c033512ad0c90e95ede5166089dcdf3b6c3b1b31da150e51484984300dcf2'

    const signatureComponents = (request.headers.signature as string).split(' ');

    if (signatureComponents.length < 3) {

      const error = new AuthError(`Signature header is improperly formatted: "${request.headers.signature}"`, `SIGNATURE_HEADER_INVALID`);
      error.details = `It should look like: "simple-hmac-auth sha256 a42d7b09a929b997aa8e6973bdbd5ca94326cbffc3d06a557d9ed36c6b80d4ff"`;

      throw error;
    }

    const [protocol, algorithm, signature] = signatureComponents;

    if (protocol !== 'simple-hmac-auth') {

      const error = new AuthError(`Signature header included unsupported protocol version: "${protocol}". Ensure the client and server are using the latest signature library.`, `SIGNATURE_HEADER_INVALID`);

      error.details = `Expected "simple-hmac-auth"`;

      throw error;
    }

    if (!algorithms.includes(algorithm)) {

      throw new AuthError(`Authorization header send invalid algorithm: "${algorithm}". The only supported hmac algorithms are: "${algorithms.join('", "')}"`, `HMAC_ALGORITHM_INVALID`);
    }

    const requestURL = url.parse(request.url!);

    const headers: {[key: string] : string} = {};

    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') {
        headers[key] = value;
      }
    }

    const canonical = canonicalize(request.method!, requestURL.pathname!, requestURL.query!, headers, data);

    const calculatedSignature = sign(canonical, secret, algorithm);

    (request as any).signature = calculatedSignature;
    (request as any).signatureExpected = calculatedSignature;

    if (signature !== calculatedSignature) {

      throw new AuthError(`Signature is invalid.`, `SIGNATURE_INVALID`);
    }

    // It worked!
    (request as any).authenticated = true;

    return { apiKey, secret, signature };
  }

  /**
   * Extract the API key from a request
   * @private
   * @param   {object} request - An HTTP request
   * @returns {string} API Key, if included
   */
  _apiKeyForRequest(request: http.IncomingMessage): string | undefined {

    let apiKey;

    if (request.headers.authorization !== undefined) {

      // The authorization header should look like this:
      // api-key sampleKey
      const components = request.headers.authorization.split(' ');

      if (components.length > 1) {
        apiKey = components[1];
      }

    } else {

      let query: {[apiKey: string]: string} = {};

      if ((request as any).query !== undefined) {

        query = (request as any).query;

      } else {

        query = querystring.parse(url.parse(request.url!).query!) as {[apiKey: string]: string};
      }

      if (query !== undefined && query.apiKey !== undefined) {

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
  private _secretForKey(apiKey: string): Promise<string | undefined> {

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

        reject(new AuthError(`Internal failure while attempting to locate secret for API key "${apiKey}": secretForKey has timed out after ${(this.options.secretForKeyTimeout / 1000)} seconds`, `INTERNAL_ERROR_SECRET_TIMEOUT`));

      }, this.options.secretForKeyTimeout);


      // Check if this function expects a callback
      if (this.secretForKey.length === 2) {

        const callback = (error?: Error, secret?: string) => {

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

      const returnValue = (this.secretForKey as SecretKeyReturnFunction | SecretKeyPromiseFunction)(apiKey);

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

      // If we aren't waiting for a callback or a promise, resolve the timer right now
      clearTimeout(timer);

      // If the secretForKey function does not accept a callback and the return value was not a promise,
      // --assume that the resulting value is the return
      resolve(returnValue as string);
    });
  }

  /**
   * Extract the raw body data from a request
   * @private
   * @param   {object} request - An HTTP request
   * @returns {Promise} A promise that will resolve with the raw body of the request, or a blank string
   */
  private _rawBodyForRequest(request: http.IncomingMessage): Promise<string> {

    return new Promise((resolve, reject) => {

      if ((request as any).rawBody !== undefined && (request as any).rawBody !== null) {
        resolve((request as any).rawBody);
        return;
      }

      const { bodySizeLimit, bodySizeLimitBytes } = this.options;

      const chunks: Buffer[] = [];

      request.on('data', (chunk: Buffer) => {

        chunks.push(chunk);

        if (Buffer.concat(chunks).byteLength >= bodySizeLimitBytes) {
          const error = new ExtendedError(`Maximum file length (${bodySizeLimit}mb) exceeded.`);
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

export default SimpleHMACAuth;
module.exports = SimpleHMACAuth;
