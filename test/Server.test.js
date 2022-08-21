'use strict';

const EventEmitter = require('events');
const SimpleHMACAuth = require('../src');
const { Server } = SimpleHMACAuth;

describe('Server class', () => {

  test('assumes valid defaults', () => {

    const server = new Server();

    expect(server.options.verbose).toBe(false);
    expect(server.options.secretForKeyTimeout).toBe(10000);
    expect(server.options.permittedTimestampSkew).toBe(60000);
    expect(server.options.bodySizeLimit).toBe(10);
    expect(server.secretForKey).toBeUndefined();
  });

  test('respects options', () => {

    const server = new Server({
      verbose: true,
      secretForKeyTimeout: 2500,
      permittedTimestampSkew: 5 * 1000,
      bodySizeLimit: 2,
      secretForKey: (apiKey) => 'secret'
    });

    expect(server.options.verbose).toBe(true);
    expect(server.options.secretForKeyTimeout).toBe(2500);
    expect(server.options.permittedTimestampSkew).toBe(5000);
    expect(server.options.bodySizeLimitBytes).toBe(2000000);
    expect(typeof server.secretForKey).toBe('function');
  });

  test('ignores invalid options', () => {

    const invalid = new Server({
      verbose: 1,
      secretForKeyTimeout: '5seconds',
      permittedTimestampSkew: true,
      bodySizeLimit: [],
      secretForKey: { a: 1, b: 2 }
    });

    const defaults = new Server();

    expect(invalid.options.verbose).toBe(defaults.options.verbose);
    expect(invalid.options.secretForKeyTimeout).toBe(defaults.options.secretForKeyTimeout);
    expect(invalid.options.permittedTimestampSkew).toBe(defaults.options.permittedTimestampSkew);
    expect(invalid.options.bodySizeLimit).toBe(defaults.options.bodySizeLimit);
    expect(invalid.secretForKey).toBeUndefined();
  });

  test('supports secretForKey functions with direct return, promises, or callbacks', async () => {

    const apiKey = 'API_KEY';
    const server = new Server();

    server.secretForKey = (apiKey) => 'direct';
    await expect(server._secretForKey(apiKey)).resolves.toBe('direct');

    server.secretForKey = (apiKey) => Promise.resolve('promise');
    await expect(server._secretForKey(apiKey)).resolves.toBe('promise');

    server.secretForKey = async (apiKey) => 'async';
    await expect(server._secretForKey(apiKey)).resolves.toBe('async');

    server.secretForKey = (apiKey, callback) => { callback(null, 'callback'); };
    await expect(server._secretForKey(apiKey)).resolves.toBe('callback');

    server.secretForKey = undefined;
    await expect(server._secretForKey(apiKey)).rejects.toThrow();
  });

  test('successfully pulls the apiKey from the request', () => {

    const server = new Server();

    const keyInHeaders = {
      headers: {
        authorization: 'api-key KEY_IN_HEADER'
      },
      query: {}
    };

    expect(server._apiKeyForRequest(keyInHeaders)).toBe('KEY_IN_HEADER');

    const keyInQuery = {
      headers: {},
      query: {
        apiKey: 'KEY_IN_QUERY'
      }
    };

    expect(server._apiKeyForRequest(keyInQuery)).toBe('KEY_IN_QUERY');


    const keyInQueryString = {
      headers: {},
      url: '/v1/items?apiKey=KEY_IN_QUERYSTRING&limit=500'
    };

    expect(server._apiKeyForRequest(keyInQueryString)).toBe('KEY_IN_QUERYSTRING');
  });

  test('handles secretForKey function failures', async () => {

    const apiKey = 'API_KEY';
    const server = new Server({
      secretForKeyTimeout: 150
    });

    // Throw if there's no secretForKey function
    await expect(server._secretForKey(apiKey)).rejects.toThrow();

    // Resolves to undefined if the function returns undefined
    server.secretForKey = (apiKey) => { return undefined; };
    await expect(server._secretForKey(apiKey)).resolves.toBeUndefined();

    // Throw if the secretForKey function rejects
    server.secretForKey = (apiKey) => Promise.reject(new Error('Something went wrong'));
    await expect(server._secretForKey(apiKey)).rejects.toThrow();

    // Throw if the secretForKey function throws an error
    server.secretForKey = (apiKey) => {
      throw new Error('Something went wrong');
    };
    await expect(server._secretForKey(apiKey)).rejects.toThrow(Error);

    // Throw if the secretForKey function implements a callback that returns an error
    server.secretForKey = (apiKey, callback) => {
      callback(new Error('Something went wrong'));
    };
    await expect(server._secretForKey(apiKey)).rejects.toThrow();
  });

  test('handles bodyForRequest when the body has already been parsed', async () => {

    const server = new Server();
    await expect(server._rawBodyForRequest({
      rawBody: '[1,2,3]'
    })).resolves.toBe('[1,2,3]');
  });

  test('handles request body when the raw body has not been parsed', (done) => {

    const server = new Server();
    const request = new EventEmitter();

    server._rawBodyForRequest(request).then(body => {
      expect(body).toBe('abc123def456ghi789');
      done();
    });

    request.emit('data', Buffer.from('abc'));
    request.emit('data', Buffer.from('123'));
    request.emit('data', Buffer.from('def'));
    request.emit('data', Buffer.from('456'));
    request.emit('data', Buffer.from('ghi'));
    request.emit('data', Buffer.from('789'));
    request.emit('end');
  });

  test('rejects parsing a body over the specified limit', (done) => {

    expect.assertions(1);

    const server = new Server({ bodySizeLimit: 0 });

    const request = new EventEmitter();

    server._rawBodyForRequest(request).catch(error => {
      expect(error).not.toBeUndefined();
      done();
    });

    request.emit('data', Buffer.from('abcdef'));
    request.emit('end');
  });

  test('fails to authenticate when the body rejects', (done) => {

    expect.assertions(1);

    const server = new Server({ bodySizeLimit: 0 });

    const request = new EventEmitter();

    request.headers = {};
    request.url = '/';

    server.authenticate(request, true).catch(error => {
      expect(error).not.toBeUndefined();
      done();
    });

    request.emit('data', Buffer.from('abcdef'));
    request.emit('end');
  });

  test('rejects authentication when the secret cannot be determined', async () => {

    expect.assertions(1);

    const server = new Server();
    server.secretForKey = async (apiKey) => {
      return undefined;
    };

    const request = {
      headers: {},
      url: '/'
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('API_KEY_MISSING');
    }
  });

  test('rejects authentication when the secretForKey function rejects', async () => {

    expect.assertions(2);

    const server = new Server();

    const request = {
      method: 'GET',
      url: '/',
      headers: { authorization: 'api-key EXAMPLE_API_KEY' }
    };

    // Test rejecting with an error

    server.secretForKey = (apiKey) => Promise.reject(new Error('Something went wrong'));

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('INTERNAL_ERROR_SECRET_DISCOVERY');
    }

    // Test rejecting without an error

    server.secretForKey = (apiKey) => Promise.reject();

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('INTERNAL_ERROR_SECRET_DISCOVERY');
    }
  });

  test('rejects authentication when the secretForKey function times out', async () => {

    expect.assertions(1);

    const server = new Server({ secretForKeyTimeout: 150 });

    server.secretForKey = (apiKey, callback) => {
      setTimeout(() => {
        callback(null, 'SECRET');
      }, 155);
    };

    const request = {
      method: 'GET',
      url: '/',
      headers: { authorization: 'api-key EXAMPLE_API_KEY' }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('INTERNAL_ERROR_SECRET_TIMEOUT');
    }
  });

  test('rejects authentication when the secretForKey function returns nothing', async () => {

    expect.assertions(1);

    const server = new Server();
    server.secretForKey = (apiKey) =>  {
      return undefined;
    };

    const request = {
      method: 'GET',
      url: '/',
      headers: { authorization: 'api-key EXAMPLE_API_KEY' }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('API_KEY_UNRECOGNIZED');
    }
  });

  test('rejects authentication when signature header is missing', async () => {

    expect.assertions(1);

    const server = new Server();
    server.secretForKey = (apiKey) => 'SECRET';

    const request = {
      method: 'GET',
      url: '/',
      headers: { authorization: 'api-key EXAMPLE_API_KEY' }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('SIGNATURE_HEADER_MISSING');
    }
  });

  test('rejects authentication when both the date and timestamp headers are missing', async () => {

    expect.assertions(1);

    const server = new Server();
    server.secretForKey = (apiKey) => 'SECRET';

    const request = {
      method: 'GET',
      url: '/',
      headers: {
        authorization: 'api-key EXAMPLE_API_KEY',
        signature: 'simple-hmac-auth sha256 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3'
      }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('DATE_HEADER_MISSING');
    }
  });

  test('rejects authentication when date header is outside of the permitted skew', async () => {

    expect.assertions(1);

    const skew = 5000;

    const server = new Server({
      permittedTimestampSkew: skew,
      secretForKey: (apiKey) => 'SECRET'
    });

    // Use a date 100 milliseconds past the permitted skew time
    const ago = new Date(new Date().getTime() - (skew + 100));

    const request = {
      method: 'GET',
      url: '/',
      headers: {
        authorization: 'api-key EXAMPLE_API_KEY',
        signature: 'simple-hmac-auth sha256 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3',
        date: ago.toUTCString()
      }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('DATE_HEADER_INVALID');
    }
  });

  test('rejects authentication when the signature header does not include 3 components', async () => {

    expect.assertions(1);

    const server = new Server({
      secretForKey: (apiKey) => 'SECRET'
    });

    const request = {
      method: 'GET',
      url: '/',
      headers: {
        authorization: 'api-key EXAMPLE_API_KEY',
        signature: 'simple-hmac-auth 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3',
        date: new Date().toUTCString()
      }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('SIGNATURE_HEADER_INVALID');
    }
  });

  test('rejects authentication when the protocol declared in the signature header is invalid', async () => {

    expect.assertions(1);

    const server = new Server({
      secretForKey: (apiKey) => 'SECRET'
    });

    const request = {
      method: 'GET',
      url: '/',
      headers: {
        authorization: 'api-key EXAMPLE_API_KEY',
        signature: 'easy-signing sha256 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3',
        date: new Date().toUTCString()
      }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('SIGNATURE_HEADER_INVALID');
    }
  });

  test('rejects authentication when the algorithm declared in the signature header is not accepted', async () => {

    expect.assertions(1);

    const server = new Server({
      secretForKey: (apiKey) => 'SECRET'
    });

    const request = {
      method: 'GET',
      url: '/',
      headers: {
        authorization: 'api-key EXAMPLE_API_KEY',
        signature: 'simple-hmac-auth md5 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3',
        date: new Date().toUTCString()
      }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('HMAC_ALGORITHM_INVALID');
    }
  });

  test('rejects authentication when the signature is incorrect', async () => {

    expect.assertions(1);

    const server = new Server({
      secretForKey: (apiKey) => 'SECRET'
    });

    const request = {
      method: 'GET',
      url: '/',
      headers: {
        authorization: 'api-key EXAMPLE_API_KEY',
        signature: 'simple-hmac-auth sha256 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3',
        date: new Date().toUTCString()
      }
    };

    try {
      await server.authenticate(request);
    } catch (error) {
      expect(error.code).toBe('SIGNATURE_INVALID');
    }
  });
});
