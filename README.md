# simple-hmac-auth

HTTP authentication specification and Node library designed to make building APIs that use HMAC signatures simple.

[![ci](https://github.com/jessety/simple-hmac-auth/workflows/ci/badge.svg)](https://github.com/jessety/simple-hmac-auth/actions)
[![npm](https://img.shields.io/npm/v/simple-hmac-auth.svg)](https://www.npmjs.com/package/simple-hmac-auth)
[![license](https://img.shields.io/github/license/jessety/simple-hmac-auth.svg)](https://github.com/jessety/simple-hmac-auth/blob/master/LICENSE)

- [Specification](#specification)
- [Server](#server)
- [Client](#client)
  - [Usage](#using-client)
  - [Subclassing](#subclassing-client)
- [Additional Implementations](#additional-implementations)
  - [Koa Middleware](https://github.com/jessety/simple-hmac-auth-koa)
  - [Express Middleware](https://github.com/jessety/simple-hmac-auth-express)
  - [Swift Client](https://github.com/jessety/simple-hmac-auth-swift/)
  - [Objective-C Client](https://github.com/jessety/simple-hmac-auth-objc/)
  - [PHP Client](https://github.com/jessety/simple-hmac-auth-php/)

## Specification

For all incoming requests, the HTTP method, path, query string, headers and body should be signed with a secret and sent as the request's "signature." The headers should include the user's API key as well as a timestamp of when the request was made. On the server, the request signature is re-generated and confirmed against the signature from the client. If the signatures do not match the request is rejected. If the server receives a request with a timestamp older than five minutes it is also rejected.

This enables three things:

- Verify the authenticity of the client
- Prevent MITM attack
- Protect against replay attacks

The client's authenticity is confirmed by their continued ability to produce signatures based on their secret. This approach also prevents man-in-the-middle attacks because any tampering would result in the signature mismatching the request's contents. Finally, replay attacks are prevented because signed requests with old timestamps will be rejected.

Request signatures are designed to be used in conjunction with HTTPS.

### Headers

Each request requires three headers: `date`, `authorization` and `signature`. If the HTTP request contains a body, the `content-length` and `content-type` headers are also required.

The `date` header is a standard [RFC-822 (updated in RFC-1123)](https://tools.ietf.org/html/rfc822#section-5) date, as per [RFC-7231](https://tools.ietf.org/html/rfc7231#section-7.1.1.2).

The `authorization` header is a standard as per [RFC-2617](https://tools.ietf.org/html/rfc2617#section-3.2.2) that, confusingly, is designed for authentication and not authorization. It should contain a string representation of the client's API key.

The `signature` header contains the signature of the entire request, as well as a reference to the version of the protocol, and the algorithm used to generate the signature.
> (Note: As per [RFC-6648](https://tools.ietf.org/html/rfc6648), X- prefixed headers should not be adopted for new protocols, and thus the prefix is omitted.)

A correctly signed HTTP request may look like this:

```text
  POST https://localhost:443/api/items/
  content-type: application/json
  content-length: 90
  date: Tue, 20 Apr 2016 18:48:24 GMT
  authorization: api-key SAMPLE_API_KEY
  signature: simple-hmac-auth sha256 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3
```

### Signature

To calculate the signature, the client first needs to create a string representation of the request. When the server receives an authenticated request it computes the the signature and compares it with the signature provided by the client. Therefore, the client must create a string representation of the request in the exact same way as the server. This is called "canonicalization."

The format of a canonical representation of a request is:

```text
  HTTP Verb + \n
  URI + \n
  Canonical query string + \n
  Canonically formatted signed headers + \n
  Hashed body payload
```

The canonical representations of these elements are as follows

|Component|Format|Example|
|---------|------|-------|
|HTTP Verb | upperCase(verb) | POST, GET or DELETE |
|URI | encode(uri) | /items/test%20item|
|Query String | encode(paramA) + '=' + encode(valueA) + '&' + encode(paramB) + '=' + encode(valueB) | paramA=valueA&paramB=value%20B |
|Headers | lowerCase(keyA) + ':' + trim(valueA) + '\n' + lowerCase(keyB) + ':' + trim(valueB) | keyA:valueA<br>keyB:value%20B
|Hashed payload | hex(hash('sha256', bodyData)) | ... |

The HTTP verb must be upper case. The URI should be url-encoded. The query string elements should be alphabetically sorted. The header keys must all be lower case (as per [RFC-2616](http://www.ietf.org/rfc/rfc2616.txt)) and alphabetically sorted. The only headers included in the signature should be: `authorization` and `date`- however `content-length` and `content-type` should be included if the HTTP body is not empty. The last line of the request string should be a hex representation of a SHA256 hash of the request body. If there is no request body, it should be the hash of an empty string.

Programmatically:

```text
  upperCase(method) + \n
  path + \n
  encode(paramA) + '=' + escape(valueA) + '&' + escape(paramB) + '=' + escape(valueB) + \n
  lowerCase(headerKeyA) + ':' + trim(headerValueA) + \n + lowerCase(headerKeyB) + ':' + trim(headerKeyB) + \n
  hex(hash('sha256', bodyData)) + \n
```

For Example

```text
  POST
  /items/test
  paramA=valueA&paraB=value%20B
  authorization: api-key SAMPLE_API_KEY
  content-length:15
  content-type: application/json
  date:Tue, 20 Apr 2016 18:48:24 GMT
  8eb2e35250a66c65d981393c74cead26a66c33c54c4d4a327c31d3e5f08b9e1b
```

Then the HMAC signature of the entire request is generated by signing it with the secret, as a hex representation:

```text
const signature = hex(hmacSha256(secret, requestString))
```

That value is then sent as the contents of the `signature` header along with the algorithm used to generate it, as well as the version of the protocol the signature implements.

```javascript
headers[signature] = 'simple-hmac-auth sha256 ' + signature
```

## Usage

Reference implementation libraries for both servers and clients are included.

### Server

The server implementation is a class that takes a request object and body data, signs the request, and compares the signature to the one sent by the client. If the signature is not valid, it will throw an error with an explanation as to why.

Middleware implementations for both [Express](https://github.com/jessety/simple-hmac-auth-express) and [Koa](https://github.com/jessety/simple-hmac-auth-koa) exist in their own repositories.

#### Example

First, instantiate the class.

```javascript
const SimpleHMACAuth = require('simple-hmac-auth');

const auth = new SimpleHMACAuth.Server();
```

The class requires a `secretForKey` function that returns the secret for a specified API key, if one exists. This function may return a value, execute a callback, or return a promise.

Assuming a `secretForAPIKey` objects exists, the three following implementations are all valid.

```javascript
// Return
auth.secretForKey = (apiKey) => {
  return secretForAPIKey[apiKey];
}

// Callback
auth.secretForKey = (apiKey, callback) => {
  callback(null, secretForAPIKey[apiKey]);
};

// Promise
auth.secretForKey = async (apiKey) => secretForAPIKey[apiKey];
```

Finally, create the server itself. Because the unparsed body must be hashed to authenticate a request, you must load the full body before calling `authenticate()`.

```javascript
http.createServer((request, response) => {

  let data = '';

  request.on('data', chunk => {
    data += chunk.toString();
  });

  request.on('end', async () => {

    try {

      const { apiKey, signature } = await auth.authenticate(request, data);

      console.log(`Authentication passed for request with API key "${apiKey}" and signature "${signature}".`);

      response.writeHead(200);
      response.end('200');

    } catch (error) {

      console.log(`  Authentication failed`, error);

      response.writeHead(401);
      response.end(error.message);
    }
  });
}).listen(8000);
```

Alternatively, Sending a boolean `true` as the 2nd parameter instead of the raw body instructs `simple-hmac-auth` to handle the body itself.

```javascript
http.createServer((request, response) => {

  try {

      await auth.authenticate(request, true);

      response.writeHead(200);
      response.end('200');

    } catch (error) {

      response.writeHead(401);
      response.end(error.message);
    }
}).listen(8000);
```

### Client

There are two ways to use the client class: directly, or by subclassing to make your own client. It supports using callbacks as well as promises, as well as serializing JavaScript objects as the query string or request.

#### Using Client

To point it to your service, instantiate it with your host, port, and if you've enabled SSL yet.

```javascript
const SimpleHMACAuth = require('simple-hmac-auth');

const client = new SimpleHMACAuth.Client('API_KEY', 'SECRET', {
  host: 'localhost',
  port: 8000,
  ssl: false
});
```

Set up the request options

```javascript
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
```

To make a request, execute the `.request()` function. It returns a promise, but will execute a callback if provided with one.

Callback

```javascript
client.request(options, (error, results) => {

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(results);
});
```

Promise

```javascript
client.request(options).then(results => {

  console.log(results);

}).catch(error => {

  console.log('Error:', error);
});
```

Async promise

```javascript
try {

  const results = await client.request(options);

  console.log(results);

} catch (error) {

  console.log('Error:', error);
}
```

#### Subclassing Client

To write a client for your service, simply extend the class and add functions that match your API routes.

```javascript

const SimpleHMACAuth = require('simple-hmac-auth');

class SampleClient extends SimpleHMACAuth.Client {

  constructor(apiKey, secret, settings) {
    super(apiKey, secret, settings);

    self.settings.host = 'api.example.com';
    self.settings.port = 443;
    self.settings.ssl = true;
  }

  create(data, callback) {
    return this.request({ method: 'POST', path: '/items/', data }, callback);
  }

  detail(id, parameters, callback) {
    return this.request({ method: 'GET', path: '/items/' + encodeURIComponent(id), query: parameters }, callback);
  }

  query(parameters, callback) {
    return this.request({ method: 'GET', path: '/items/', query: parameters }, callback);
  }

  update(id, data, callback) {
    return this.request({ method: 'POST', path: '/items/' + encodeURIComponent(id), data }, callback);
  }

  delete(id, callback) {
    return this.request({ method: 'DELETE', path: '/items/' + encodeURIComponent(id) }, callback);
  }
}

module.exports = SampleClient;
```

Because this client's constructor specified the host, port, and SSL status of the service, it can be instantiated with just `apiKey` and `secret`.

```javascript
const client = new SampleClient(apiKey, secret);
```

Just like its parent class, this example subclass implements both promises and callbacks.

```javascript
try {

  const results = await client.query({ test: true });

  console.log(results);

} catch (error) {

  console.log('Error:', error);
}
```

```javascript
client.query({ test: true }, (error, results) => {

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log(results);
});

```

## Additional Implementations

Middleware for Express and Koa that leverage the implementation in this client exist in their own repositories. Compatible clients for iOS and PHP have also been implemented.

- [Koa Middleware](https://github.com/jessety/simple-hmac-auth-koa)
- [Express Middleware](https://github.com/jessety/simple-hmac-auth-express)
- [Swift Client](https://github.com/jessety/simple-hmac-auth-swift/)
- [Objective-C Client](https://github.com/jessety/simple-hmac-auth-objc/)
- [PHP Client](https://github.com/jessety/simple-hmac-auth-php/)

## License

MIT © Jesse Youngblood
