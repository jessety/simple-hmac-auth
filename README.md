simple-hmac-auth
=============

Node Library designed to make building an API that uses HMAC signatures simple.

Includes a server component, Express middleware, and a client.

- [Specification](#specification)
- Server
  - [Express Server](#express-server)
  - [HTTP Server](#http-server)
- Client
  - [Client](#client-class)
  - [Client Subclass](#client-subclass)
- [Additional Implementations](#additional-implementations)
  - [iOS](https://github.com/jessety/simple-hmac-auth-ios/)
  - [PHP](https://github.com/jessety/simple-hmac-auth-php/)

## Specification

For all incoming requests, the HTTP method, path, query string, headers and body should be signed with a secret and sent as the request's "signature." The headers should the user's API key, as well as a timestamp of when the request was made. On the server, the request is confirmed against the signature. If the signature does not match, the request is rejected. If the server receives a request with a timestamp older than five minutes, it is also rejected.

This enables three things:
- Verify the authenticity of the client
- Prevent MITM attack
- Protect against replay attacks

The client's authenticity is confirmed by their continued ability to produce signatures based on their secret. This approach also prevents man-in-the-middle attacks because any tampering would result in the signature mismatching the request's contents. Finally, replay attacks are prevented because signed requests with old timestamps will be rejected.

Request signatures are designed to be used in conjunction with HTTPS.

#### Headers

Each request requires three headers: `date`, `authorization` and `signature`. If the HTTP request contains a body, the `content-length` and `content-type` headers are also required.

The `date` header is a standard [RFC-822 (updated in RFC-1123)](https://tools.ietf.org/html/rfc822#section-5) date, as per [RFC-7231](https://tools.ietf.org/html/rfc7231#section-7.1.1.2).

The `authorization` header is a standard as per [RFC-2617](https://tools.ietf.org/html/rfc2617#section-3.2.2) that, confusingly, is designed for authentication and not authorization. It should contain a string representation of the client's API key.

The `signature` header contains the signature of the entire request, as well as a reference to the algorithm used to generate that signature.
> (Note: As per [RFC-6648](https://tools.ietf.org/html/rfc6648), X- prefixed headers should not be adopted for new protocols, and thus the `signature` header is just `signature`.)


A correctly signed HTTP request may look like this:
```text
  POST https://localhost:443/api/items/ 
  content-type: application/json
  content-length: 90
  date: Tue, 20 Apr 2016 18:48:24 GMT
  authorization: api-key SAMPLE_API_KEY
  signature: sha256 64b0a4bd0cbb45c5b2fe8b1e4a15419b6018a9a90eb19046247af6a9e8896bd3
```

#### Signature

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
```
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
```
const signature = hex(hmacSha256(secret, requestString))
```

That value is then sent as the contents of the `signature` header along with the algorithm used to generate the hmac signature.
```
headers[signature] = 'sha256 ' + signature
```


## Usage

A reference implementation of both a server and client are included, as is direct integration with Express.


### Express Server

The included Express middleware requires a few options.

```javascript
const SimpleHMACAuth = require('simple-hmac-auth');

app.use(SimpleHMACAuth.middleware({

  // Required
  secretForKey: (apiKey, callback) => {
    // Call back with the correct secret for the specified API key
    return 'secret';
  },
  onRejected: (error, request, response, next) => {
    // Handle failed authentication
    response.status(401).end('401');
  }
}));
```

Because the unparsed body of the request must be loaded and hashed to confirm authentication, the included middleware also parses the request body. If you would like to parse the contents of the request body, it accepts the same parameters as [body-parser](https://github.com/expressjs/body-parser):

```javascript
const SimpleHMACAuth = require('simple-hmac-auth');

app.use(SimpleHMACAuth.middleware({

  // Required
  secretForKey: (apiKey, callback) => { return 'secret' },
  onRejected: (error, request, response, next) => { response.status(401).end('401') }, 

  // Body-parser options. All optional.
  json: true,
  urlencoded: { extended: true, limit: '10mb' },
  text: { type: 'application/octet-stream' }
}));
```

Full implementation:

```javascript
const express = require('express');
const SimpleHMACAuth = require('simple-hmac-auth');

const secretForAPIKey = {
  API_KEY_ONE: 'SECRET_ONE',
  API_KEY_TWO: 'SECRET_TWO'
};

const app = express();

// Required. Execute callback with either an error, or an API key.
const secretForKey = (apiKey, callback) => {

  if (secretForAPIKey.hasOwnProperty(apiKey)) {

    callback(null, secretForAPIKey[apiKey]);
    return;
  }

  callback();
};

// Required. Handle requests that have failed authentication.
const onRejected = (error, request, response, next) => {

  console.log(`Authentication failed`, error);

  response.status(401).json({
    error: error
  });
};

// Optional. Log requests that have passed authentication.
const onAccepted = (request, response) => {
  console.log(`Authentication succeeded for request with API key "${request.apiKey}" and signature: "${request.signature}"`);
};

// Register authentication middleware 
// Include which body-parser modules to parse the request data with
// Specifying 'true' instead of an options dictionary will use defaults
app.use(SimpleHMACAuth.middleware({

  // Required
  secretForKey: secretForKey,
  onRejected: onRejected, 

  // Optional
  onAccepted: onAccepted,

  // Body-parser options. All optional.
  json: true,
  urlencoded: { extended: true, limit: '10mb' },
  text: { type: 'application/octet-stream' }
}));

// Set up routes
app.all('*', (request, response) => {
  console.log(`Routing request: ${request.method} ${request.url}`);
  response.status(200).end('200');
});

// Start the server
app.listen(8000, () => {
  console.log(`Listening!`);
});
```

### HTTP Server

The server implementation provides a promise-based method.

```javascript
const http = require('http');
const SimpleHMACAuth = require('simple-hmac-auth');

const secretForAPIKey = {
  API_KEY_ONE: 'SECRET_ONE',
  API_KEY_TWO: 'SECRET_TWO'
};

const auth = new SimpleHMACAuth.Server();

// Required. Execute callback with either an error, or an API key.
auth.secretForKey = (apiKey, callback) => {

  if (secretForAPIKey.hasOwnProperty(apiKey)) {

    callback(null, secretForAPIKey[apiKey]);
    return;
  }

  callback();
};

// Create HTTP server
http.createServer((request, response) => {

  let data = '';

  request.on('data', chunk => { 
    data += chunk.toString();
  });

  request.on('end', async () => {

    console.log(`Got request ${request.method} ${request.url}`);

    try {

      const { apiKey, signature } = await auth.authenticate(request, data);

      console.log(`Authentication passed for request with API key "${apiKey}" and signature "${signature}".`);

      response.writeHead(200);
      response.end('200');

    } catch (error) {

      console.log(`  Authentication failed`, error);

      response.writeHead(401, {'content-type': 'application/json'});
      response.end(JSON.stringify({error}));
    }

  });

}).listen(8000);

```



## Client Implementation

### Client Class

A JavaScript client that implements HMAC signing is included. Although the server component supports any type of input data, this client is specifically created to support JSON APIs. To point it to your service, instantiate it with your host, port, and if you've enabled SSL yet.

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
It returns a promise, but will execute a callback if provided with one.
```javascript
client.request(options, (error, results) => {

  if (error) {
    console.error(`Error:`, error);
    return;
  }

  console.log(results);
});
```
```javascript
client.request(options).then(results => {
  
  console.log(results);
  
}).catch(error => {
  
  console.log(`Error:`, error);
});
```
```javascript
try {

  const results = await client.request(options);
  
  console.log(results);

} catch (error) {

  console.log(`Error:`, error);
}
```

### Client Subclass

To write a client for your service, simply extend the class and add functions that match your API routes.

```javascript

const SimpleHMACAuth = require('simple-hmac-auth');

class SampleClient extends SimpleHMACAuth.Client {

  constructor(apiKey, secret, settings) {
    super(apiKey, secret, settings);
    
    self.settings.host = 'api.myservice.com';
    self.settings.port = 443;
    self.settings.ssl = true;
  }

  create(data, callback) {
    return this.call('POST', '/items/', data, undefined, callback);
  }

  detail(id, parameters, callback) {
    return this.call('GET', '/items/' + encodeURIComponent(id), undefined, parameters, callback);
  }

  query(parameters, callback) {
    return this.call('GET', '/items/', undefined, parameters, callback);
  }

  update(id, data, callback) {
    return this.call('POST', '/items/' + encodeURIComponent(id), data, undefined, callback);
  }

  delete(id, callback) {
    return this.call('DELETE', '/items/' + encodeURIComponent(id), undefined, undefined, callback);
  }
}

module.exports = SampleClient;

```

Because this client's constructor specified the host, port, and SSL status of the service, it can be instantiated without any parameters beyond `apiKey` and `secret`. 

```javascript
const client = new SampleClient(apiKey, secret);
```

Just like its parent class, this subclass implements both promises and callbacks.

```javascript
const query = {
  string: 'string',
  boolean: true,
  number: 42
};
```
```javascript
try {

  const results = await client.query(query);
  
  console.log(results);

} catch (error) {

  console.log('Error:', error);
}
```
```javascript 
client.query(query, (error, results) => {

  if (error) {
    console.log('Error:', error);
    return;
  }

  console.log(results);
});

```

## Additional Implementations

Compatible `simple-hmac-auth` clients for iOS and PHP have also been implemented

 * [iOS](https://github.com/jessety/simple-hmac-auth-ios/)
 * [PHP](https://github.com/jessety/simple-hmac-auth-php/)
