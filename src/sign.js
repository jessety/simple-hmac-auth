//
//  Simple HMAC Auth
//  /src/sign.js
//  Created by Jesse T Youngblood on 3/24/16 at 11:31am
//

'use strict';

const crypto = require('crypto');

// Permitted algorithms
const algorithms = [
  'sha1',
  'sha256',
  'sha512'
];

/**
 * Generate a HMAC hash for a canonicalized request
 * @param   {string} canonical A canonicalized version of a request
 * @param   {string} secret    A secret key
 * @param   {string} algorithm Algorithm to use to generate the hmac
 * @returns {string}   Signature for this request
 */
function sign(canonical, secret, algorithm) {

  if (!algorithm.includes(algorithm)) {
    return;
  }

  return crypto.createHmac(algorithm, secret).update(canonical).digest('hex');
}

module.exports = { sign, algorithms };
