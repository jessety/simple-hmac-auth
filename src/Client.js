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

    this._settings = settings;

    if (apiKey === undefined || apiKey === null || apiKey === '' || typeof apiKey !== 'string') {

      throw new AuthError('Client created without an API key.');
    }

    settings.apiKey = apiKey;

    if (secret === undefined || secret === null) {

      // All requests will be sent unsigned.
      this.log('Client created without a secret. All requests will be sent unsigned.');

    } else if (secret === '' || typeof secret !== 'string') {

      throw new Error(`Invalid secret: "${secret}"`);

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

    if (!algorithms.includes(settings.algorithm)) {
      throw new Error(`Invalid HMAC algorithm: "${settings.algorithm}". The only supported algorithms are: "${algorithms.join('", "')}"`);
    }

    if (!settings.hasOwnProperty('timeout') || typeof settings.timeout !== 'number') {
      settings.timeout = 7500;
    }

    if (!settings.hasOwnProperty('maxSockets') || typeof settings.maxSockets !== 'number') {
      settings.maxSockets = 250;
    }

    if (!settings.hasOwnProperty('headers') || typeof settings.headers !== 'object') {
      settings.headers = {};
    }

    if (!settings.hasOwnProperty('options') || typeof settings.options !== 'object') {
      settings.options = {};
    }

    if (settings.ssl) {
      this.agent = new https.Agent({ maxSockets: settings.maxSockets });
    } else {
      this.agent = new http.Agent({ maxSockets: settings.maxSockets });
    }

    this._settings = settings;
  }

  /**
   * Log debug messages to the console, if 'verbose' is enabled.
   */
  log(...messages) {

    if (this._settings.verbose !== true) {
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

    let { method, path, data, query, headers: callHeaders } = call;
    const { apiKey, secret, host, port, ssl, timeout, headers: settingsHeaders, options: settingsOptions } = this._settings;

    return new Promise((resolve, reject) => {

      // Create one function to handle all errors
      const fail = error => {

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
        const error = new Error('Request did not include HTTP method');
        error.code = 'EBADINPUT';
        fail(error);
        return;
      }

      if (path === undefined) {
        const error = new Error('Request did not include a path');
        error.code = 'EBADINPUT';
        fail(error);
        return;
      }

      method = method.toUpperCase();

      if (query === undefined || query === null || typeof query !== 'object') {
        query = {};
      }

      let headers = {};

      if (settingsHeaders && callHeaders) {

        headers = { ...settingsHeaders, ...callHeaders };

      } else if (callHeaders) {

        headers = { ...callHeaders };

      } else if (settingsHeaders) {

        headers = { ...settingsHeaders };
      }

      headers.authorization = `api-key ${apiKey}`;
      headers.date = new Date().toUTCString();

      // Sort query keys alphabetically
      const keys = Object.keys(query).sort();

      let queryString = '';

      keys.forEach((key, index) => {

        let value;

        if ([ 'string', 'number', 'boolean' ].includes(typeof query[key])) {

          value = String(query[key]);

        } else {

          try {
            value = JSON.stringify(query[key]);
          } catch (e) {
            const error = new Error(`Could not serialize parameter ${key}: ${e.message}`);
            error.code = 'EBADINPUT';
            error.details = e;
            fail(error);
            return;
          }
        }

        value = encodeURIComponent(value);
        key = encodeURIComponent(key);

        queryString += key + '=' + value;

        if (index !== (keys.length - 1)) {
          queryString += '&';
        }
      });

      let bodyData;

      // Serialize body object
      // If the body is anything but a string, serialize it as JSON
      if (data !== undefined) {

        if (typeof data === 'string') {

          bodyData = data;

        } else {

          try {

            bodyData = JSON.stringify(data);
            headers['content-type'] = 'application/json';

          } catch (e) {

            const error = new Error(`Could not serialize input data: ${e.message}`);
            error.code = 'EBADINPUT';
            error.details = e;
            fail(error);
            return;
          }
        }
      }

      let url = path;

      if (queryString.length > 0) {
        url = url + '?' + queryString;
      }

      if (bodyData !== undefined) {
        headers['content-length'] = Buffer.byteLength(bodyData);
      }

      if (secret !== undefined) {

        const { algorithm } = this._settings;

        const canonical = canonicalize(method, path, queryString, headers, bodyData);

        const signature = sign(canonical, secret, algorithm);

        // Populate the HTTP authorization header
        headers.signature = `simple-hmac-auth ${algorithm} ${signature}`;
      }

      let options = {};

      if (settingsOptions !== undefined) {
        options = { ...settingsOptions };
      }

      options = {
        ...options,
        ...call,
        method,
        host,
        port,
        path: url,
        headers
      };

      if (options.agent === undefined && this.agent !== undefined) {
        options.agent = this.agent;
      }

      if (this._settings.verbose) {

        let message = options.method + ' ' + options.host + ':' + options.port + options.path;

        message += '\n  Headers: ' + JSON.stringify(headers);

        if (bodyData !== undefined && bodyData.length < 500) {
          message += '\n  Data: ' + bodyData;
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

          // If the response code isn't 200, throw an error
          if (response.statusCode !== 200) {

            // Construct a basic error object. If we can't fill in the details, default to the status code
            let error = new Error(`Error ${response.statusCode}`);

            // If this is HTTP 401, this is an authentication issue
            // Use an instance of the AuthError class instead of a generic Error
            if (response.statusCode === 401) {
              error = new AuthError(`Error ${response.statusCode}`);
            }

            if (typeof object === 'object' && object !== null && typeof object.error === 'object' && object.error !== null) {

              // If the JSON response contains an "error" object, inherit it's properties

              for (let [ key, value ] of Object.entries(object.error)) {

                // You can't overwrite the name of a JavaScript error class instance
                if (key === 'name') {
                  key = 'error_name';
                }

                error[key] = value;
              }

            } else if (typeof object === 'object' && object !== null) {

              // If the response doesn't contain an error object, assume the response itself is the error

              for (let [ key, value ] of Object.entries(object)) {

                // You can't overwrite the name of a JavaScript error class instance
                if (key === 'name') {
                  key = 'error_name';
                }

                error[key] = value;
              }

            } else if (typeof object === 'string') {

              // If the response data is just a JSON-encoded string, use that response as the error message

              error.message = object;

            } else if (typeof responseData === 'string') {

              // If the response data is just a string, use that response as the error message

              error.message = responseData;
            }

            // Don't return a stack that points to this function, since that isn't particularly helpful
            delete error.stack;

            fail(error);
            return;
          }

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

        const error = new Error('The request has timed out.');
        error.code = 'ETIMEOUT';
        fail(error);
      });

      if (bodyData !== undefined) {
        request.write(bodyData);
      }

      request.end();
    });
  }

}

module.exports = Client;
