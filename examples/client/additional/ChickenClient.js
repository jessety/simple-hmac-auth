//
//  Simple HMAC Auth
//  /usage/client/ChickenClient.js
//  Sample Client subclass, designed to be used with promises
//  Also, use custom headers
//  Created by Jesse T Youngblood on 11/22/18 at 12:20pm
//

'use strict';

const SimpleHMACAuth = require('../../../index');

class ChickenClient extends SimpleHMACAuth.Client {

  constructor(apiKey, secret, settings) {

    if (typeof settings !== 'object') {
      settings = {};
    }

    settings.host = 'api.samplechickenservice.software';
    settings.port = 443;
    settings.ssl = true;

    super(apiKey, secret, settings);

    this.headers = {
      'x-custom-header': 'custom header value'
    };
  }

  create(data) {

    return this.request({
      method: 'POST',
      path: '/chickens/',
      data,
      headers: this.headers
    });
  }

  detail(id, query) {

    return this.request({
      method: 'GET',
      path: '/chickens/' + encodeURIComponent(id),
      query,
      headers: this.headers
    });
  }

  query(query) {

    return this.request({
      method: 'GET',
      path: '/chickens/',
      query,
      headers: this.headers
    });
  }

  update(id, data) {

    return this.request({
      method: 'POST',
      path: '/chickens/' + encodeURIComponent(id),
      data,
      headers: this.headers
    });
  }

  delete(id) {

    return this.request({
      method: 'DELETE',
      path: '/chickens/' + encodeURIComponent(id),
      headers: this.headers
    });
  }
}

module.exports = ChickenClient;
