//
//  Simple HMAC Auth
//  /usage/client/bear_usage.js
//  Created by Jesse T Youngblood on 3/23/16 at 10:42pm
//

/* eslint no-console: off */

'use strict';

const fs = require('fs');
const BearClient = require('./BearClient');

const settings = {
  apiKey: 'API_KEY',
  secret: 'SECRET'
};

const client = new BearClient(settings.apiKey, settings.secret, { verbose: true });

function test() {

  console.log('Testing Bears API!');

  return new Promise(async (resolve, reject) => {

    try {

      const createdTime = new Date().getTime() / 1000;

      console.log(' === Creating a new bear');

      // const bear =
      await client.create({
        name: 'Red Panda',
        size: 'small and unthreatening',
        color: 'red',
        createdTime: createdTime
      });

      const bear = {};

      if (bear.id === undefined) {
        bear.id = 66;
      }

      const updatedTime = new Date().getTime() / 1000;

      // Put some edge cases in the POST body
      const update = {
        updatedTime: updatedTime,
        diet: '🍕',

        string: 'string',
        boolean: true,
        number: 42,
        object: { contents: true },
        array: [ 1, 2, 3 ],
        'spaces in key': true,
        spacesInValue: 'present here',

        Norway: 'ø',
        Spain: 'ñ',
        Burger: '🍔'
      };

      console.log(' === Updating bear');

      await client.update(bear.id, update);

      console.log(' === Querying for the bear we just made');

      await client.detail(bear.id);

      console.log(' === Uploading a file');

      await uploadFile(bear.id);

      console.log(' === Deleting our bear');

      await client.delete(bear.id);

      console.log(' === Done!');

      resolve();

    } catch (e) {

      reject(e);
    }
  });
}

function uploadFile(id) {

  console.log('Testing a file upload..');

  const fileLocation = `${__dirname}/bear_usage.js`;

  return new Promise((resolve, reject) => {

    fs.readFile(fileLocation, (error, data) => {

      if (error) {
        reject({
          message: `Error parsing file at ${fileLocation}`,
          details: error
        });
        return;
      }

      const base64 = new Buffer.from(data).toString('base64');

      const update = {
        fileAdded: new Date().getTime() / 1000,
        file: base64
      };

      client.update(id, update, (error) => {

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });
}


/*
    Run all tests!
*/

test().then(() => {

  console.log(' ==== All tests succeeded ==== ');

}).catch(error => {

  console.error(' ==== Test failed ====');
  console.error(error);
});
