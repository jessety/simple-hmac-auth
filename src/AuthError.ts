//
//  Simple HMAC Auth
//  /src/AuthError.js
//  Created by Jesse T Youngblood on 7/23/19 at 15:05
//

class AuthError extends Error {

  public code?: string;

  [key: string]: unknown

  constructor(message: string, code?: string) {

    super(message);

    Error.captureStackTrace(this, this.constructor);

    if (code !== undefined) {
      this.code = code;
    }
  }

  private toJSON(): {[key: string]: unknown} {

    // Explicitly pull non-enumerable properties
    const { message } = this; // message, name, stack

    // Pull all enumerable properties
    return { ...this, message };
  }
}

Object.defineProperty(AuthError.prototype, 'name', { value: 'AuthError' });

export default AuthError;
module.exports = AuthError;
