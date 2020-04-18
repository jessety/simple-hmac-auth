'use strict';

const AuthError = require('../src/AuthError.js');

describe('AuthError', () => {

  test('uses default name "AuthError"', () => {

    const anError = new AuthError('An issue occurred');

    expect(anError.name).toBe('AuthError');

    expect(anError.toString()).toBe('AuthError: An issue occurred');
  });

  test('serializes "message" and "code" properties by default', () => {

    const error = new AuthError('An issue occurred', 'D12');

    const roundtrip = JSON.parse(JSON.stringify(error));

    expect(error.message).toBe(roundtrip.message);
    expect(error.code).toBe(roundtrip.code);
  });

  test('Retains error codes', () => {

    const error = new AuthError('An issue occurred', 'D12');

    expect(error.code).toEqual('D12');
  });
});
