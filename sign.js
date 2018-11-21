//
//  sign.js
//  Created by Jesse T Youngblood on 3/24/16 at 11:31am 
//    

'use strict';

const crypto = require('crypto');

/**
 * Generate a hash for a request
 * @param   {string} secret      The user's secret
 * @param   {string} method      The HTTP method. GET, POST, DELETE, etc.
 * @param   {string} uri         The path of the request
 * @param   {object} queryString The full query string, with keys and values individually hashed
 * @param   {object} headers     An object containing all headers
 * @param   {string} data        The body contents
 * @returns {string} A signature for the request
 */
function sign(secret, method, path, queryString, headers, data) {

  const string = stringForRequest(method, path, queryString, headers, data);
  const signature = crypto.createHmac('sha256', secret).update(string).digest('hex');

  return signature;
}

/**
 * Generate a string for a request
 * @param   {string} method      The HTTP method. GET, POST, DELETE, etc.
 * @param   {string} uri         The path of the request
 * @param   {object} queryString The full query string
 * @param   {object} headers     An object containing all headers
 * @param   {string} data        The body contents
 * @returns {string} A string representing the request
 */
function stringForRequest(method, uri, queryString, headers, data) {

  // Hash the method, the path, aplhabetically sorted headers, alphabetically sorted GET parameters, POST data 

  method = method.toUpperCase();

  if (queryString === undefined) {
    queryString = '';
  }

  if (data === undefined) {
    data = '';
  }

  // Create a new list of headers, with the keys all lower case. Do this before sorting them, to make sure we don't bork the sort.
  let newHeaders = {};

  // Only sign these headers, no more
  let headersWhitelist = [
    'x-api-key',
    'date',
    'content-length',
    'content-type'
  ];

  Object.keys(headers).forEach(function(key) {

    if (headersWhitelist.indexOf(key) === -1) {
      return;
    }

    if (key === 'content-length' && headers[key] === '0') {
      return;
    }

    newHeaders[key.toLowerCase()] = headers[key];
  });

  // Get the list of all header keys
  let headerKeys = Object.keys(newHeaders);

  // Sort the header keys alphabetically
  headerKeys.sort();

  let headerString = '';

  headerKeys.forEach(function(key, index) {

    let value = newHeaders[key];

    // Make sure our value is a string, so we can trim it
    if (typeof value !== 'string') {
      value = '' + value;
    }

    headerString += key + ':' + value.trim();

    if (index !== (headerKeys.length - 1)) {
      headerString += '\n';
    }

  });

  const dataHash = crypto.createHash('sha256').update(data, 'utf8').digest('hex');

  /*
    The string format is:
        method + \n
        URL + \n
        Alphabetically sorted query string with individually escaped keys and values + \n
        Alphabetically sorted headers with lower case keys
        Hash of body

    Or:
        POST
        /bears/
        great=true&great%20test=123&test=testing%20true
        a-api-key=12345&content-length=15
        (hash)
    */

  let string = '';

  string += method + '\n';
  string += uri + '\n';
  string += queryString + '\n';
  string += headerString + '\n';
  string += dataHash;

  return string;
}

module.exports = sign;
