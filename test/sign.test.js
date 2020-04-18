'use strict';

const { sign } = require('../src/sign.js');

describe('sign function', () => {

  test('signs blank strings', () => {
    expect(sign('', '', 'sha256')).toEqual('b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad');
  });

  test('signs requests', () => {

    const canonical = `POST
/v1/items/
?test=true&yes=affirmative
authorization:api-key SAMPLE_API_KEY
content-length:13
content-type:application/json
date:Tue, 20 Apr 2016 18:48:24 GMT
6fd977db9b2afe87a9ceee48432881299a6aaf83d935fbbe83007660287f9c2e`;

    const secret = `EXAMPLE_SECRET`;

    expect(sign(canonical, secret, 'sha256')).toBe('c63bbc553f115f9fa14ca222b6894b8f5c54afd19631157c031c1c3267fa09e1');
  });

  test('only accepts valid algorithms', () => {

    const valid = [ 'sha1', 'sha256', 'sha512' ];
    const invalid = [ 'md5', 'whirlpool' ];

    expect.assertions(valid.length + invalid.length);

    for (const algorithm of valid) {
      expect(() => sign('', '', algorithm)).not.toThrow();
    }

    for (const algorithm of invalid) {
      expect(() => sign('', '', algorithm)).toThrow();
    }
  });
});
