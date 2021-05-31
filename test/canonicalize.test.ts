import { canonicalize } from '../src';

describe('canonicalize function', () => {

  test('serializes basic requests', () => {

    const method = 'GET';
    const path = '/';
    const queryString = '';
    const headers = {};
    const data = undefined;

    const canonicalized = canonicalize(method, path, queryString, headers, data);
    const exemplar = 'GET\n/\n\n\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    expect(canonicalized).toEqual(exemplar);
  });

  test('serializes expansive requests', () => {

    const method = 'POST';
    const path = '/v1/items/';
    const queryString = '?test=true&yes=affirmative';
    const data = '{"test":true}';
    const headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.from(data).length),
      authorization: 'api-key SAMPLE_API_KEY',
      date: 'Tue, 20 Apr 2016 18:48:24 GMT',
      'additional-header': 'some-message'
    };

    const canonicalized = canonicalize(method, path, queryString, headers, data);
    const exemplar = `POST
/v1/items/
?test=true&yes=affirmative
authorization:api-key SAMPLE_API_KEY
content-length:13
content-type:application/json
date:Tue, 20 Apr 2016 18:48:24 GMT
6fd977db9b2afe87a9ceee48432881299a6aaf83d935fbbe83007660287f9c2e`;

    expect(canonicalized).toEqual(exemplar);
  });

  test('only signs "content-length" if it is greater than 0', () => {

    const method = 'POST';
    const path = '/v1/items/';
    const queryString = '';
    const data = '';
    const headers = {
      'content-length': '0',
      authorization: 'api-key SAMPLE_API_KEY',
      date: 'Tue, 20 Apr 2016 18:48:24 GMT',
      'x-additional-header': 'some-message'
    };

    const canonicalized = canonicalize(method, path, queryString, headers, data);
    const exemplar = `POST
/v1/items/

authorization:api-key SAMPLE_API_KEY
date:Tue, 20 Apr 2016 18:48:24 GMT
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`;

    expect(canonicalized).toEqual(exemplar);
  });
});
