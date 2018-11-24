//
//  Simple HMAC Auth
//  /usage/client/ChickenClient.js
//  Sample Client subclass, designed to be used with promises
//  Created by Jesse T Youngblood on 11/22/18 at 12:20pm 
//    

'use strict';

const SimpleHMACAuth = require('../../../index');

class ChickenClient extends SimpleHMACAuth.Client {

  constructor(apiKey, secret, settings) {
    super(apiKey, secret, settings);
    
    this.settings.host = 'api.samplechickenservice.software';
    this.settings.port = 443;
    this.settings.ssl = true;
  }

  create(data) {

    return this.request({
      method: 'POST',
      path: '/chickens/',
      data
    });
  }

  detail(id, query) {

    return this.request({
      method: 'GET',
      path: '/chickens/' + encodeURIComponent(id),
      query
    });
  }

  query(query) {

    return this.request({
      method: 'GET',
      path: '/chickens/',
      query
    });
  }

  update(id, data) {

    return this.request({
      method: 'POST',
      path: '/chickens/' + encodeURIComponent(id),
      data
    });
  }

  delete(id) {

    return this.request({
      method: 'DELETE',
      path: '/chickens/' + encodeURIComponent(id)
    });
  }
}

module.exports = ChickenClient;
