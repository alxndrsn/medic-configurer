const fs = require('../lib/sync-fs');

module.exports = shell => {
  if(!shell) shell = 'bash';

  const completionFile = `${__dirname}/shell-completion.${shell}`;

  if(fs.exists(completionFile)) {
    console.log(fs.read(completionFile));
    process.exit(0);
  } else {
    console.error('shell completion not yet supported for', shell);
    process.exit(1);
  }
};
