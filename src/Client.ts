//
//  Simple HMAC Auth
//  /src/Client.js
//  Created by Jesse T Youngblood on 3/23/16 at 10:42pm
//

import http from 'http';
import https from 'https';

import { sign, algorithms } from './sign';
import canonicalize from './canonicalize';
import AuthError from './AuthError';

interface ClientSettings {
  verbose?: boolean
  timeout?: number
  maxSockets?: number
  host?: string
  port?: number
  ssl?: boolean
  algorithm?: string
  useDateHeader?: boolean
  headers?: {[key: string]: string}
  options?: http.RequestOptions | https.RequestOptions
}

type ClientSettingsWithAuthentication = ClientSettings & { apiKey: string, secret: string };
type ClientCallback = ((error?: Error, response?: string | unknown) => void);

class ExtendedError extends Error {
  [key: string]: string | undefined
}

class Client {

  _settings: ClientSettingsWithAuthentication;
  agent: http.Agent | https.Agent;

  /**
   * Server Interface
   * @param {string}  apiKey                   API key
   * @param {string}  [secret]                 Secret key. Optional, but all requests are sent unsigned if omitted
   * @param {object}  [settings]               All additional options
   * @param {boolean} [settings.verbose=false] If true, log debug information to the console
   * @param {number}  [settings.timeout=7500]  How long until giving up on a request, in milliseconds
   * @param {number}  [settings.maxSockets=25] The maximum number of sockets to keep open to the platform at any given time
   */
  constructor(apiKey: string, secret?: string, settings?: Partial<ClientSettings>) {

    if (settings === undefined || settings === null) {

      settings = {};
    }

    if (typeof settings !== 'object') {

      throw new AuthError('Client created with invalid settings.');
    }

    if (typeof settings.verbose !== 'boolean') {
      settings.verbose = false;
    }

    this._settings = settings as ClientSettingsWithAuthentication;

    if (apiKey === undefined || apiKey === null || apiKey === '' || typeof apiKey !== 'string') {

      throw new AuthError('Client created without an API key.');
    }

    const validatedSettings: ClientSettingsWithAuthentication = settings as ClientSettingsWithAuthentication;

    validatedSettings.apiKey = apiKey;

    if (secret === undefined || secret === null) {

      // All requests will be sent unsigned.
      this.log('Client created without a secret. All requests will be sent unsigned.');

    } else if (secret === '' || typeof secret !== 'string') {

      throw new Error(`Invalid secret: "${secret}"`);

    } else {

      validatedSettings.secret = secret;
    }

    if (typeof validatedSettings.host !== 'string') {
      validatedSettings.host = 'localhost';
    }

    if (typeof validatedSettings.ssl !== 'boolean') {
      validatedSettings.ssl = false;
    }

    if (typeof validatedSettings.port !== 'number') {

      validatedSettings.port = 80;

      if (validatedSettings.ssl) {

        validatedSettings.port = 443;
      }
    }

    if (typeof validatedSettings.algorithm !== 'string') {
      validatedSettings.algorithm = 'sha256';
    }

    if (!algorithms.includes(validatedSettings.algorithm)) {
      throw new Error(`Invalid HMAC algorithm: "${settings.algorithm}". The only supported algorithms are: "${algorithms.join('", "')}"`);
    }

    if (typeof validatedSettings.timeout !== 'number') {
      validatedSettings.timeout = 7500;
    }

    if (typeof validatedSettings.maxSockets !== 'number') {
      validatedSettings.maxSockets = 250;
    }

    if (typeof validatedSettings.useDateHeader !== 'boolean') {
      validatedSettings.useDateHeader = false;
    }

    if (typeof validatedSettings.headers !== 'object') {
      validatedSettings.headers = {};
    }

    if (typeof validatedSettings.options !== 'object') {
      validatedSettings.options = {};
    }

    if (settings.ssl) {
      this.agent = new https.Agent({ maxSockets: settings.maxSockets });
    } else {
      this.agent = new http.Agent({ maxSockets: settings.maxSockets });
    }

    this._settings = validatedSettings;
  }

  /**
   * Log debug messages to the console, if 'verbose' is enabled.
   */
  log(...out: unknown[]): void {

    if (this._settings.verbose !== true) {
      return;
    }

    console.log(this.constructor.name, ...out);
  }

  /**
   * Make a signed request to the server
   * @param   {string}   method   The HTTP method for this request
   * @param   {string}   path     The path for this request
   * @param   {object}   [query]  An object containing all the keys and values for the query string
   * @param   {object}   [data]   The message data
   * @param   {function} callback Callback executed when the request has succeeded or failed
   */
  call(method: string, path: string, data?: unknown, query?: {[key: string]: string}, callback?: ClientCallback): Promise<string | unknown> {

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
  request(call: {
    method?: string
    path?: string
    query?: {[key: string]: unknown}
    headers?: {[key: string]: string}
    data?: unknown
  }, callback?: ClientCallback): Promise<string | unknown> {

    let { method, path, data, query, headers: callHeaders } = call;
    const { apiKey, secret, host, port, ssl, timeout, headers: settingsHeaders, options: settingsOptions } = this._settings;

    return new Promise((resolve, reject) => {

      // Create one function to handle all errors
      const fail = (error: Error) => {

        if (typeof callback === 'function') {

          callback(error);

          // Be sure to dispose of the callback so we don't end up calling it later
          callback = undefined;
          return;
        }

        // Otherwise, assume this was a promise

        reject(error);
      };

      // Serialize anything that needs serialization
      // The query, the body, Adnan Syed, etc.

      if (method === undefined) {
        const error = new ExtendedError('Request did not include HTTP method');
        error.code = 'EBADINPUT';
        fail(error);
        return;
      }

      if (path === undefined) {
        const error = new ExtendedError('Request did not include a path');
        error.code = 'EBADINPUT';
        fail(error);
        return;
      }

      method = method.toUpperCase();

      if (query === undefined || query === null || typeof query !== 'object') {
        query = {};
      }

      let headers: {[key:string]: string} = {};

      if (settingsHeaders && callHeaders) {

        headers = { ...settingsHeaders, ...callHeaders };

      } else if (callHeaders) {

        headers = { ...callHeaders };

      } else if (settingsHeaders) {

        headers = { ...settingsHeaders };
      }

      headers.authorization = `api-key ${apiKey}`;

      if (this._settings.useDateHeader === true) {
        headers.date = new Date().toUTCString();
      } else {
        headers.timestamp = new Date().toUTCString();
      }

      // Sort query keys alphabetically
      const keys = Object.keys(query).sort();

      let queryString = '';

      keys.forEach((key, index) => {

        let value = query![key]!;

        if ([ 'string', 'number', 'boolean' ].includes(typeof value)) {

          value = String(value);

        } else {

          try {
            value = JSON.stringify(value);
          } catch (e: any) {
            const error = new ExtendedError(`Could not serialize parameter ${key}: ${e.message}`);
            error.code = 'EBADINPUT';
            error.details = e;
            fail(error);
            return;
          }
        }

        value = encodeURIComponent(value as string);
        key = encodeURIComponent(key);

        queryString += `${key}=${value}`;

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

          } catch (e: any) {

            const error = new ExtendedError(`Could not serialize input data: ${e.message}`);
            error.code = 'EBADINPUT';
            error.details = e;
            fail(error);
            return;
          }
        }
      }

      let url = path;

      if (queryString.length > 0) {
        url = `${url}?${queryString}`;
      }

      if (bodyData !== undefined) {
        headers['content-length'] = String(Buffer.byteLength(bodyData));
      }

      if (secret !== undefined) {

        const { algorithm } = this._settings;

        const canonical = canonicalize(method, path, queryString, headers, bodyData);

        const signature = sign(canonical, secret, algorithm!);

        // Populate the HTTP authorization header
        headers.signature = `simple-hmac-auth ${algorithm} ${signature}`;
      }

      let options: http.RequestOptions = {};

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

        let message = `${options.method} ${options.host}:${options.port}${options.path}`;

        message += `\n  Headers: ${JSON.stringify(headers)}`;

        if (bodyData !== undefined && bodyData.length < 500) {
          message += `\n  Data: ${bodyData}`;
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

            let error: AuthError | ExtendedError;

            // Construct a basic error object. If we can't fill in the details, default to the status code
            error = new ExtendedError(`Error ${response.statusCode}`);

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

            callback(undefined, object ?? responseData);
            callback = undefined;
            return;
          }

          resolve(object || responseData);
        });
      });

      request.on('error', error => {

        request.destroy();

        fail(error);
      });

      request.setTimeout(timeout!, () => {

        request.destroy();

        const error = new ExtendedError('The request has timed out.');
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

export default Client;
module.exports = Client;
