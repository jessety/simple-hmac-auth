//
//  /usage/client/SampleClient.js
//  Example of a SimpleHMACAuth Client subclass for a service
//  This client may be used with either callbacks or promises
//  Created by Jesse T Youngblood on 11/23/18 at 19:11pm 
//    

'use strict';

const SimpleHMACAuth = require('../../index');

class SampleClient extends SimpleHMACAuth.Client {

  constructor(apiKey, secret, settings) {
    super(apiKey, secret, settings);

    // Replace with the host / port of your service
    this.settings.host = 'localhost';
    this.settings.port = 80;
    this.settings.ssl = false;
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
