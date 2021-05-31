import http from 'http';
import { Client, AuthError } from '../src';

describe('Client class', () => {

  test('assumes valid defaults', () => {

    const client = new Client('API_KEY', 'SECRET');

    expect(client._settings.ssl).toBe(false);
    expect(client._settings.host).toBe('localhost');
    expect(client._settings.port).toBe(80);
    expect(client._settings.algorithm).toBe('sha256');
    expect(client._settings.timeout).toBe(7500);
    expect(client._settings.maxSockets).toBe(250);
    expect(client.agent.maxSockets).toBe(250);
    expect(client._settings.headers).toEqual({});
    expect(client._settings.options).toEqual({});
    expect(client._settings.verbose).toBe(false);
  });

  test('respects options', () => {

    const client = new Client('API_KEY', 'SECRET', {
      ssl: true,
      host: 'api.example.org',
      algorithm: 'sha512',
      timeout: 30 * 1000,
      maxSockets: 500,
      headers: { 'x-custom-header': 'custom-value' },
      options: {
        timeout: 100
      },
      verbose: true
    });

    expect(client._settings.ssl).toBe(true);
    expect(client._settings.host).toBe('api.example.org');
    expect(client._settings.port).toBe(443);
    expect(client._settings.algorithm).toBe('sha512');
    expect(client._settings.timeout).toBe(30000);
    expect(client._settings.maxSockets).toBe(500);
    expect(client.agent.maxSockets).toBe(500);
    expect(client._settings.headers).toEqual({ 'x-custom-header': 'custom-value' });
    expect(client._settings.options).toEqual({ timeout: 100 });
    expect(client._settings.verbose).toBe(true);
  });

  test('rejects invalid requests', async () => {

    const client = new Client('API_KEY', 'SECRET');

    // No HTTP Method
    await expect(client.request({})).rejects.toThrow();

    // No path
    await expect(client.request({ method: 'GET' })).rejects.toThrow();

    // Query parameters that can't be serialized to JSON
    const circular: unknown[] = [];
    circular.push(circular);

    await expect(client.request({
      method: 'GET',
      path: '/v1/',
      query: {
        test: true,
        circular: circular
      }
    })).rejects.toThrow();

    // Body data that can't be serialized to JSON

    await expect(client.request({
      method: 'GET',
      path: '/v1/',
      query: { test: true },
      data: circular
    })).rejects.toThrow();
  });

  test('fails invalid requests with callbacks', async (done) => {

    const client = new Client('API_KEY', 'SECRET');

    // No HTTP Method, path, or anything
    client.request({}, (error) => {
      expect(error).not.toBeUndefined();
      done();
    });
  });

  test('resolves requests with promises', async () => {

    expect.assertions(2);

    const port = 6000;

    const server = http.createServer((request, response) => {
      response.writeHead(200);
      response.end('OK');
    });

    const client = new Client('API_KEY', 'SECRET', {
      ssl: false,
      host: 'localhost',
      port: port
    });

    server.listen(port);

    const responseA = await client.request({
      method: 'GET',
      path: '/v1/items/',
      query: { test: true, limit: 500 },
      headers: { 'x-custom-header': 'custom-value' }
    });

    expect(responseA).toBe('OK');

    const responseB = await client.call('GET', '/v1/items/');

    expect(responseB).toBe('OK');

    server.close();
  });

  test('resolves requests with callbacks', (done) => {

    expect.assertions(4);

    const port = 6001;

    const server = http.createServer((request, response) => {
      response.writeHead(200);
      response.end('OK');
    });

    const client = new Client('API_KEY', 'SECRET', {
      ssl: false,
      host: 'localhost',
      port: port
    });

    server.listen(port);

    let requestDone = false;
    let callDone = false;

    client.request({
      method: 'GET',
      path: '/v1/items/',
      query: { test: true },
      headers: { 'x-custom-header': 'custom-value' }
    }, (error, response) => {
      expect(error).toBeUndefined();
      expect(response).toBe('OK');

      requestDone = true;
      if (callDone) {
        server.close();
        done();
      }
    });

    client.call('GET', '/v1/items/', undefined, undefined, (error, response) => {
      expect(error).toBeUndefined();
      expect(response).toBe('OK');

      callDone = true;
      if (requestDone) {
        server.close();
        done();
      }
    });
  });

  test('rejects requests when the server status is not 200', async () => {

    const port = 6002;

    const server = http.createServer((request, response) => {

      if (request.url === '/500') {
        response.writeHead(500);
      } else if (request.url === '/401') {
        response.writeHead(401);
      } else {
        response.writeHead(200);
      }

      response.end();
    });

    const client = new Client('API_KEY', 'SECRET', {
      ssl: false,
      host: 'localhost',
      port: port
    });

    server.listen(port);

    await expect(client.request({ method: 'GET', path: '/' }));

    await expect(client.request({ method: 'GET', path: '/500' })).rejects.toThrow(Error);

    await expect(client.request({ method: 'GET', path: '/401' })).rejects.toThrow(AuthError);

    server.close();
  });

  test('makes requests using headers declared in class instantiation as well as request calls', async () => {

    expect.assertions(9);

    const port = 6003;

    const server = http.createServer((request, response) => {

      const { url, headers } = request;

      if (url === '/test-1') {

        expect(headers['x-custom-header-a']).toBe('value-a');
        expect(headers['x-custom-header-b']).toBe('value-b');
        expect(headers['x-custom-header-c']).toBeUndefined();

      } else if (url === '/test-2') {

        expect(headers['x-custom-header-a']).toBe('value-a');
        expect(headers['x-custom-header-b']).toBeUndefined();
        expect(headers['x-custom-header-c']).toBeUndefined();

      } else if (url === '/test-3') {

        expect(headers['x-custom-header-a']).toBeUndefined();
        expect(headers['x-custom-header-b']).toBeUndefined();
        expect(headers['x-custom-header-c']).toBe('value-c');
      }

      response.end();
    });

    const client = new Client('API_KEY', 'SECRET', {
      ssl: false,
      host: 'localhost',
      port: port,
      headers: {
        'x-custom-header-a': 'value-a'
      }
    });

    server.listen(port);

    // Send the header created for all requests when instantiating the class, as well as one specified in the request

    await client.request({
      method: 'GET',
      path: '/test-1',
      headers: { 'x-custom-header-b': 'value-b' }
    });

    // Send only the class header

    await client.request({
      method: 'GET',
      path: '/test-2'
    });

    // Delete the class header and only send an extra header in the request

    client._settings.headers = undefined;

    await client.request({
      method: 'GET',
      path: '/test-3',
      headers: { 'x-custom-header-c': 'value-c' }
    });

    server.close();
  });

  test('makes requests serializes input data if it isn\'t a string', async () => {

    expect.assertions(4);

    const port = 6004;

    const dataObject = {
      test: true,
      items: [
        { name: 'Item A' },
        { name: 'Item B' }
      ]
    };
    const dataXML = `
    <xml>
      <test>true</test>
      <items>
        <item><name>Item A</name><identifier>A</identifier></item>
        <item><name>Item B</name><identifier>B</identifier></item>
      </items>
    </xml>`;

    const server = http.createServer((request, response) => {

      let data = '';

      request.on('data', chunk => data += chunk.toString());

      request.on('end', async () => {

        const { url, headers } = request;

        if (url === '/json') {

          expect(headers['content-type']).toBe('application/json');
          expect(data).toBe(JSON.stringify(dataObject));

        } else if (url === '/xml') {

          expect(headers['content-type']).toBe('application/xml');
          expect(data).toBe(dataXML);
        }

        response.end();
      });
    });

    const client = new Client('API_KEY', 'SECRET', { ssl: false, host: 'localhost', port });

    server.listen(port);

    // Send a JSON body

    await client.request({
      method: 'POST',
      path: '/json',
      headers: {},
      data: dataObject
    });

    // Send an XML body

    await client.request({
      method: 'POST',
      path: '/xml',
      headers: { 'content-type': 'application/xml' },
      data: dataXML
    });

    server.close();
  });

  test('rejects requests with error information from the server when possible', async () => {

    expect.assertions(8);

    const port = 6005;

    const server = http.createServer((request, response) => {

      const { url } = request;

      response.writeHead(500);

      const error = {
        message: 'An internal error has occurred',
        code: 'D12',
        name: 'error name'
      };

      if (url === '/child') {
        response.end(JSON.stringify({ error }));
      } else if (url === '/whole') {
        response.end(JSON.stringify(error));
      } else if (url === '/string') {
        response.end(error.message);
      } else if (url === '/jsonstring') {
        response.end(JSON.stringify(error.message));
      }

      response.end();
    });

    const client = new Client('API_KEY', 'SECRET', { ssl: false, host: 'localhost', port });

    server.listen(port);

    try {
      await client.request({ method: 'GET', path: '/child' });
    } catch (error) {
      expect(error.message).toBe('An internal error has occurred');
      expect(error.code).toBe('D12');
      expect(error.error_name).toBe('error name');
    }

    try {
      await client.request({ method: 'GET', path: '/whole' });
    } catch (error) {
      expect(error.message).toBe('An internal error has occurred');
      expect(error.code).toBe('D12');
      expect(error.error_name).toBe('error name');
    }

    try {
      await client.request({ method: 'GET', path: '/string' });
    } catch (error) {
      expect(error.message).toBe('An internal error has occurred');
    }

    try {
      await client.request({ method: 'GET', path: '/jsonstring' });
    } catch (error) {
      expect(error.message).toBe('An internal error has occurred');
    }

    server.close();
  });

  test('rejects requests after specified timeout', async () => {

    expect.assertions(3);

    const epoch = process.hrtime.bigint();
    const port = 6006;
    const timeout = 100;

    const server = http.createServer(() => {
      // Just leave the connection open
    });

    const client = new Client('API_KEY', 'SECRET', { ssl: false, host: 'localhost', port, timeout });

    server.listen(port);

    try {
      await client.request({ method: 'GET', path: '/' });
    } catch (error) {

      expect(error.code).toBe('ETIMEOUT');

      const timedOutAfter = ((process.hrtime.bigint() - epoch) / BigInt(1000000));

      expect(timedOutAfter).toBeLessThan(timeout + 200);
      expect(timedOutAfter).toBeGreaterThan(timeout);
    }

    server.close();
  });

  test('logs all requests when verbose is enabled', async () => {

    const port = 6007;

    const server = http.createServer((request, response) => {
      response.writeHead(200);
      response.end('OK');
    });

    const client = new Client('API_KEY', 'SECRET', { ssl: false, host: 'localhost', port, verbose: true });

    server.listen(port);

    const spy = jest.spyOn(client, 'log').mockImplementation();

    await client.request({ method: 'POST', path: '/test', data: { test: true } });

    server.close();

    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
  });

  test('prints log messages prefixed with subclass name', async () => {

    class ServiceNameClient extends Client {}

    const spy = jest.spyOn(console, 'log').mockImplementation();

    const client = new ServiceNameClient('API_KEY', 'SECRET', { verbose: true });

    client.log(`test`);

    expect(spy).toHaveBeenCalledWith('ServiceNameClient', 'test');

    spy.mockRestore();
  });

  test('makes https requests when enabled', async () => {

    const port = 6007;
    const server = http.createServer({ }, (request, response) => {
      response.writeHead(200);
      response.end('OK');
    });

    const client = new Client('API_KEY', 'SECRET', {
      ssl: true,
      host: 'localhost',
      port: port,
      options: { rejectUnauthorized: false }
    });

    server.listen(port);

    await expect(client.request({ method: 'GET', path: '/' })).rejects.toThrow();

    server.close();
  });
});
