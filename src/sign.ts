//
//  Simple HMAC Auth
//  /src/sign.js
//  Created by Jesse T Youngblood on 3/24/16 at 11:31am
//

import crypto from 'crypto';

// Permitted algorithms
export const algorithms = [
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
export function sign(canonical: string, secret: string, algorithm: string): string {

  if (!algorithms.includes(algorithm)) {
    throw new Error(`Invalid algorithm: "${algorithm}"`);
  }

  return crypto.createHmac(algorithm, secret).update(canonical).digest('hex');
}

module.exports = { sign, algorithms };
