//
//  Simple HMAC Auth
//  /src/canonicalize.js
//  Created by Jesse T Youngblood on 3/24/16 at 21:19
//

import crypto from 'crypto';

// Only sign these headers
export const headerWhitelist = [
  'authorization',
  'date',
  'content-length',
  'content-type'
];

/**
 * Generate a string for a request
 * @param   {string} method      The HTTP method. GET, POST, DELETE, etc.
 * @param   {string} uri         The path of the request
 * @param   {object} queryString The full query string
 * @param   {object} headers     An object containing all headers
 * @param   {string} data        The body contents
 * @returns {string} A string representing the request
 */
export function canonicalize(method: string, uri: string, queryString = '', headers: {[key: string]: string}, data?: string): string {

  // Hash the method, the path, aplhabetically sorted headers, alphabetically sorted GET parameters, and body data

  method = method.toUpperCase();

  if (queryString === undefined || queryString === null) {
    queryString = '';
  }

  if (data === undefined || data === null) {
    data = '';
  }

  // Create a new list of headers, with the keys all lower case. Do this before sorting them, to make sure we don't bork the sort.
  const cleanHeaders: {[key:string]: string} = {};

  for (let [ key, value ] of Object.entries(headers)) {

    key = key.toLowerCase();

    if (!headerWhitelist.includes(key)) {
      continue;
    }

    if (key === 'content-length' && value === '0') {
      continue;
    }

    cleanHeaders[key] = value;
  }

  // Get the list of all header keys
  const headerKeys = Object.keys(cleanHeaders);

  // Sort the header keys alphabetically
  headerKeys.sort();

  // Create a string of all headers, arranged alphabetically, seperated by newlines
  let headerString = '';

  for (const [ index, key ] of headerKeys.entries()) {

    let value = cleanHeaders[key];

    // Make sure our value is a string, so we can trim it
    if (typeof value !== 'string') {
      value = `${value}`;
    }

    headerString += `${key}:${value.trim()}`;

    if (index !== (headerKeys.length - 1)) {
      headerString += '\n';
    }
  }

  const dataHash = crypto.createHash('sha256').update(data, 'utf8').digest('hex');

  /*
    The string format is:
        method + \n
        URL + \n
        Alphabetically sorted query string with individually escaped keys and values + \n
        Alphabetically sorted headers with lower case keys, seperated by newlines + \n
        Hash of body, or hash of blank string if body is empty

    Or:
        POST
        /items/
        great=true&great%20test=123&test=testing%20true
        a-api-key:12345
        content-length:15
        (hash)
    */

  let string = '';

  string += `${method}\n`;
  string += `${uri}\n`;
  string += `${queryString}\n`;
  string += `${headerString}\n`;
  string += dataHash;

  return string;
}

export default canonicalize;
module.exports = canonicalize;
