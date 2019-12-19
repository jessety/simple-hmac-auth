//
//  Simple HMAC Auth
//  /src/AuthError.js
//  Created by Jesse T Youngblood on 7/23/19 at 15:05
//

'use strict';

class AuthError extends Error {

  constructor(message, code) {

    super(message);

    Error.captureStackTrace(this, this.constructor);

    if (code !== undefined) {
      this.code = code;
    }
  }

  toJSON() {

    // Explicitly pull non-enumerable properties
    const { message } = this; // message, name, stack

    // Pull all enumerable properties
    return { ...this, message };
  }
}

Object.defineProperty(AuthError.prototype, 'name', { value: 'AuthError' });

module.exports = AuthError;
