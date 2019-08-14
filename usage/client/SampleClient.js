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

    if (typeof settings !== 'object') {
      settings = {};
    }

    settings.host = 'localhost';
    settings.port = 8000;
    settings.ssl = false;

    super(apiKey, secret, settings);
  }

  create(data, callback) {
    return this.request({
      method: 'POST',
      path: '/items/',
      data
    }, callback);
  }

  detail(id, parameters, callback) {
    return this.request({
      method: 'GET',
      path: `/items/${encodeURIComponent(id)}`,
      query: parameters
    }, callback);
  }

  query(parameters, callback) {
    return this.request({
      method: 'GET',
      path: '/items/',
      query: parameters,
      headers: { 'x-custom-header': 'custom header value' }
    }, callback);
  }

  update(id, data, callback) {
    return this.request({
      method: 'POST',
      path: `/items/${encodeURIComponent(id)}`,
      data
    }, callback);
  }

  delete(id, callback) {
    return this.request({
      method: 'DELETE',
      path: `/items/${encodeURIComponent(id)}`
    }, callback);
  }
}

module.exports = SampleClient;
