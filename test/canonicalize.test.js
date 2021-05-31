'use strict';

const { canonicalize } = require('../src');

describe('canonicalize function', () => {

  test('ignores undefined query strings', () => {

    const method = 'POST';
    const path = '/v1/items/';
    const queryString = undefined;
    const data = '{"test":true}';
    const headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.from(data).length),
      authorization: 'api-key SAMPLE_API_KEY',
      date: 'Tue, 20 Apr 2016 18:48:24 GMT',
      'x-additional-header': 'some-message'
    };

    const canonicalized = canonicalize(method, path, queryString, headers, data);
    const exemplar = `POST
/v1/items/

authorization:api-key SAMPLE_API_KEY
content-length:13
content-type:application/json
date:Tue, 20 Apr 2016 18:48:24 GMT
6fd977db9b2afe87a9ceee48432881299a6aaf83d935fbbe83007660287f9c2e`;

    expect(canonicalized).toEqual(exemplar);
  });

  test('accounts for non-string headers', () => {

    const method = 'POST';
    const path = '/v1/items/';
    const queryString = undefined;
    const data = '{"test":true}';
    const headers = {
      'content-type': 'application/json',
      'content-length': Buffer.from(data).length,
      authorization: 'api-key SAMPLE_API_KEY',
      date: 'Tue, 20 Apr 2016 18:48:24 GMT',
      'x-additional-header': 'some-message'
    };

    const canonicalized = canonicalize(method, path, queryString, headers, data);
    const exemplar = `POST
/v1/items/

authorization:api-key SAMPLE_API_KEY
content-length:13
content-type:application/json
date:Tue, 20 Apr 2016 18:48:24 GMT
6fd977db9b2afe87a9ceee48432881299a6aaf83d935fbbe83007660287f9c2e`;

    expect(canonicalized).toEqual(exemplar);
  });
});
