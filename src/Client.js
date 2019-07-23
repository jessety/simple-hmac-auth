//
//  Simple HMAC Auth
//  /src/Client.js
//  Created by Jesse T Youngblood on 3/23/16 at 10:42pm
//

'use strict';

const http = require('http');
const https = require('https');

const { sign, algorithms } = require('./sign');
const canonicalize = require('./canonicalize');
const AuthError = require('./AuthError');

class Client {

  /**
   * Server Interface
   * @param {string}  apiKey                   API key
   * @param {string}  [secret]                 Secret key. Optional, but all requests are sent unsigned if omitted
   * @param {object}  [settings]               All additional options
   * @param {boolean} [settings.verbose=false] If true, log debug information to the console
   * @param {number}  [settings.timeout=7500]  How long until giving up on a request, in milliseconds
   * @param {number}  [settings.maxSockets=25] The maximum number of sockets to keep open to the platform at any given time
   */
  constructor(apiKey, secret, settings) {

    if (settings === undefined || settings === null) {

      settings = {};
    }

    if (typeof settings !== 'object') {

      throw new AuthError('Client created with invalid settings.');
    }

    if (!settings.hasOwnProperty('verbose') || typeof settings.verbose !== 'boolean') {
      settings.verbose = false;
    }

    if (apiKey === undefined || apiKey === null || apiKey === '' || typeof apiKey !== 'string') {

      throw new AuthError('Client created without an API key.');
    }

    settings.apiKey = apiKey;

    if (secret === undefined || secret === null) {

      // All requests will be sent unsigned.
      this.log('Client created without a secret. All requests will be sent unsigned.');

    } else if (secret === '' || typeof secret !== 'string') {

      throw new AuthError('Client created with an invalid secret.');

    } else {

      settings.secret = secret;
    }

    if (!settings.hasOwnProperty('host') || typeof settings.host !== 'string') {
      settings.host = 'localhost';
    }

    if (!settings.hasOwnProperty('ssl') || typeof settings.ssl !== 'boolean') {
      settings.ssl = false;
    }

    if (!settings.hasOwnProperty('port') || typeof settings.port !== 'number') {

      settings.port = 80;

      if (settings.ssl) {
        settings.port = 443;
      }
    }

    if (!settings.hasOwnProperty('algorithm') || typeof settings.algorithm !== 'string') {
      settings.algorithm = 'sha256';
    }

    if (!settings.hasOwnProperty('timeout') || typeof settings.timeout !== 'number') {
      settings.timeout = 7500;
    }

    if (!settings.hasOwnProperty('maxSockets') || typeof settings.maxSockets !== 'number') {
      settings.maxSockets = 250;
    }

    this.settings = settings;

    if (settings.ssl) {
      this.agent = new https.Agent({ maxSockets: this.settings.maxSockets });
    } else {
      this.agent = new http.Agent({ maxSockets: this.settings.maxSockets });
    }
  }

  /**
   * Log debug messages to the console, if 'verbose' is enabled.
   */
  log(...messages) {

    if (this.settings.verbose !== true) {
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`Client`, ...messages);
  }

  /**
   * Make a signed request to the server
   * @param   {string}   method   The HTTP method for this request
   * @param   {string}   path     The path for this request
   * @param   {object}   [query]  An object containing all the keys and values for the query string
   * @param   {object}   [data]   The message data
   * @param   {function} callback Callback executed when the request has succeeded or failed
   */
  call(method, path, data, query, callback) {

    const call = {
      method: method,
      path: path,
      query: query,
      data: data
    };

    return this.request(call, callback);
  }

  /**
   * Make an API call to the server
   * @param {object}   call                The method, path, query and body of the call
   * @param {string}   call.method         The HTTP method of the request
   * @param {string}   call.path           The path of the request
   * @param {object}   [call.query]        The query parameters of the request
   * @param {object}   [call.data]         The body of the request
   * @param {function} callback            Executes on completion
   */
  request(call, callback) {

    let { method, path, data, query } = call;
    const { apiKey, secret, host, port, ssl, timeout } = this.settings;

    return new Promise((resolve, reject) => {

      let done = false;

      // Create one function to handle all errors
      const fail = error => {

        if (done) {
          return;
        }

        done = true;

        if (typeof callback === 'function') {

          callback(error);

          // Be sure to dispose of the callback so we don't end up calling it later
          callback = null;
          return;
        }

        // Otherwise, assume this was a promise

        reject(error);
      };

      // Serialize anything that needs serialization
      // The query, the body, Adnan Syed, etc.

      if (method === undefined) {
        fail(new AuthError('Request did not include HTTP method'));
        return;
      }

      if (path === undefined) {
        fail(new AuthError('Request did not include a path'));
        return;
      }

      method = method.toUpperCase();

      if (query === undefined || query === null || typeof query !== 'object') {
        query = {};
      }

      const headers = {
        authorization: `api-key ${apiKey}`,
        date: new Date().toUTCString()
      };

      // Sort query keys alphabetically
      const keys = Object.keys(query).sort();

      let queryString = '';

      keys.forEach((key, index) => {

        let value;

        try {
          value = JSON.stringify(query[key]);
        } catch (e) {
          const error = new AuthError(`Could not serialize parameter ${key}: ${e.message}`);
          error.details = e;
          fail(error);
          return;
        }

        value = encodeURIComponent(value);
        key = encodeURIComponent(key);

        queryString += key + '=' + value;

        if (index !== (keys.length - 1)) {
          queryString += '&';
        }
      });

      let bodyData;

      // Serialize body
      if (data !== undefined) {

        try {
          bodyData = JSON.stringify(call.data);
        } catch (e) {
          fail(new AuthError(`Could not serialize input data: ${e.message}`, 'EBADINPUT'));
          return;
        }
      }

      let url = path;

      if (queryString.length > 0) {
        url = url + '?' + queryString;
      }

      if (bodyData !== undefined) {
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(bodyData);
      }

      if (secret !== undefined) {

        const { algorithm } = this.settings;

        // First, be sure the client is set up with a valid algorithm
        if (!algorithms.includes(algorithm)) {

          fail(new AuthError(`Configured using invalid hmac algorithm: "${algorithm}". The only supported hmac algorithms are: "${algorithms.join('", "')}"`, `HMAC_ALGORITHM_INVALID`));
          return;
        }

        const canonical = canonicalize(method, path, queryString, headers, bodyData);

        const signature = sign(canonical, secret, algorithm);

        // Populate the HTTP authorization header
        headers.signature = `simple-hmac-auth ${algorithm} ${signature}`;
      }

      const options = {
        method,
        host,
        port,
        path: url,
        headers: headers
      };

      if (this.agent !== undefined) {
        options.agent = this.agent;
      }

      if (this.settings.verbose) {

        let message = options.method + ' ' + options.host + ':' + options.port + options.path;

        message += '\nHeaders: ' + JSON.stringify(headers);

        if (bodyData !== undefined && bodyData.length < 500) {
          message += '\nData: ' + bodyData;
        }

        this.log(message);
      }

      let httpLibrary;

      if (ssl === true) {
        httpLibrary = https;
      } else {
        httpLibrary = http;
      }

      const request = httpLibrary.request(options, response => {

        let responseData = '';

        response.addListener('data', chunk => {
          responseData += chunk;
        });

        response.addListener('end', () => {

          let object;

          try {
            object = JSON.parse(responseData);
          } catch (e) {
            // This may or may not be OK, depending on the API call
          }

          // Check for an error
          if (response.statusCode !== 200) {

            const error = new AuthError(`Error ${response.statusCode}`);

            if (object && object.hasOwnProperty('error') && typeof object.error === 'object') {

              for (let [ key, value ] of Object.entries(object.error)) {

                // You can't overwrite the name of a JavaScript error
                if (key === 'name') {
                  key = 'error_name';
                }

                error[key] = value;
              }
            }

            fail(error);
            return;
          }

          if (done) {
            return;
          }

          done = true;

          // The call was successful. Maybe there's response data, maybe not.

          if (typeof callback === 'function') {

            callback(undefined, object || responseData);
            callback = null;
            return;
          }

          resolve(object || responseData);
        });
      });

      request.on('error', error => {

        request.abort();

        fail(error);
      });

      request.setTimeout(timeout, () => {

        request.abort();

        fail(new AuthError('The request has timed out.', 'ETIMEOUT'));
      });

      if (bodyData !== undefined) {
        request.write(bodyData);
      }

      request.end();
    });
  }

}

module.exports = Client;
