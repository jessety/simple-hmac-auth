import http from 'http';
import SimpleHMACAuth from '../';

test('roundtrip', async () => {

  const port = 8080;
  const apiKey = 'EXAMPLE_API_KEY';
  const secret = 'EXAMPLE_SECRET';

  // Instantiate the server authentication component

  const auth = new SimpleHMACAuth.Server();

  auth.secretForKey = async (requestAPIKey: string) => {
    if (requestAPIKey === apiKey) {
      return secret;
    }
  };

  // Create an HTTP server

  const server = http.createServer(async (request, response) => {

    try {

      await auth.authenticate(request, true);

      response.writeHead(200);
      response.end('OK');

    } catch (error) {

      response.writeHead(401);
      response.end(JSON.stringify({ error }));
    }
  });

  server.listen(port);

  // Create a client and make a request to the above server

  const client = new SimpleHMACAuth.Client(apiKey, secret, {
    host: 'localhost',
    port: port,
    ssl: false
  });

  const options = {
    method: 'POST',
    path: '/items/',
    query: {
      string: 'string',
      boolean: true,
      number: 42,
      object: { populated: true },
      array: [ 1, 2, 3 ]
    },
    data: {
      string: 'string',
      boolean: true,
      number: 42,
      object: { populated: true },
      array: [ 1, 2, 3 ]
    }
  };

  const response = await client.request(options).catch(error => {
    server.close();
    throw error;
  });

  expect(response).toEqual('OK');

  server.close();
});
