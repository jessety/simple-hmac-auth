//
//  Created by Jesse Youngblood on 11/21/18 at 12:51
// 

'use strict';

const colors = {
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  purple: '\u001B[35m',
  cyan: '\u001B[36m'
};

const reset = '\u001b[0m';

for (const [name, value] of Object.entries(colors)) {

  module.exports[name] = (...messages) => {

    return value + messages.join(' ') + reset;
  };
}
