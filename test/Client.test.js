'use strict';

const { Client } = require('../');

describe('Client class', () => {

  test('rejects invalid parameters in the constructor', () => {

    // Creating a client without an API key or secret should not work
    expect(() => new Client()).toThrow();

    // Neither should creating a client with an invalid secret
    expect(() => new Client('API_KEY', '')).toThrow();
    expect(() => new Client('API_KEY', 42)).toThrow();
    expect(() => new Client('API_KEY', false)).toThrow();

    // However, creating a client without a secret at all is OK- requests will just be sent unsigned
    expect(() => new Client('API_KEY')).not.toThrow();

    // Additional options are, of course, optional- but should throw if options aren't an object
    expect(() => new Client('API_KEY', 'SECRET', true)).toThrow();

    // Don't accept just any algorithm
    expect(() => new Client('API_KEY', 'SECRET', { algorithm: 'md5' })).toThrow();
  });

  test('prints warnings when instantiated with an empty secret', () => {

    const spy = jest.spyOn(console, 'log').mockImplementation();

    new Client('API_KEY', undefined, { verbose: true });
    new Client('API_KEY', null, { verbose: true });

    expect(spy).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });
});
