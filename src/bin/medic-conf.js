#!/usr/bin/env node

require('../cli/check-node-version');

const checkForUpdates = require('../lib/check-for-updates');
const emoji = require('../lib/emoji');
const error = require('../lib/log').error;
const fs = require('../lib/sync-fs');
const info = require('../lib/log').info;
const log = require('../lib/log');
const readline = require('readline-sync');
const redactBasicAuth = require('redact-basic-auth');
const supportedActions = require('../cli/supported-actions');
const usage = require('../cli/usage');
const warn = require('../lib/log').warn;

let args = process.argv.slice(2);
const shift = n => args = args.slice(n || 1);

if(!args.length) {
  return checkForUpdates({ nonFatal:true })
      .then(() => usage(0));
}

let instanceUrl, skipCheckForUpdates;

switch(args[0]) {
  case '--silent':  log.level = log.LEVEL_NONE;  shift(); break;
  case '--verbose': log.level = log.LEVEL_TRACE; shift(); break;
  default:          log.level = log.LEVEL_INFO;
}

let instanceUsername = 'admin';
switch(args[0]) {

//> instance URL handling:
  case '--user':
    instanceUsername = args[1];
    shift(2);
    if(args[0] !== '--instance') throw new Error('The --user switch can only be used if followed by --instance');
    /* falls through */
  case '--instance':
    const password = readline.question(`${emoji.key}  Password: `, { hideEchoBack:true });
    const encodedPassword = encodeURIComponent(password);
    instanceUrl = `https://${instanceUsername}:${encodedPassword}@${args[1]}.medicmobile.org`;
    shift(2);
    break;
  case '--local':
    if(process.env.COUCH_URL) {
      if(!process.env.COUCH_URL.match(/localhost/)) {
        throw new Error(`You asked to configure a local instance, but the COUCH_URL env var is set to '${process.env.COUCH_URL}'.  This may be a remote server.`);
      }
      instanceUrl = process.env.COUCH_URL
        .replace(/\/medic$/, '') // strip off the database
        .replace(/:5984/, ':5988'); // use api port instead of couchdb
      info('Using instance URL from COUCH_URL environment variable.');
    } else {
      instanceUrl = 'http://admin:pass@localhost:5988';
    }
    shift();
    break;
  case '--url':
    instanceUrl = args[1];
    shift(2);
    break;

//> general option handling:
  case '--help': return usage(0);
  case '--shell-completion':
    return require('../cli/shell-completion-setup')(args[1]);
  case '--supported-actions':
    console.log('Supported actions:\n ', supportedActions.join('\n  '));
    return process.exit(0);
  case '--version':
    console.log(require('../../package.json').version);
    return process.exit(0);
  case '--changelog':
    console.log(fs.read(`${__dirname}/../CHANGELOG.md`));
    return process.exit(0);
}

if(args[0] === '--no-check') {
  skipCheckForUpdates = true;
  shift();
}

const projectName = fs.path.basename(fs.path.resolve('.'));
const couchUrl = instanceUrl && `${instanceUrl}/medic`;

if(instanceUrl) {
  if(instanceUrl.match('/medic$')) warn('Supplied URL ends in "/medic".  This is probably incorrect.');

  const productionUrlMatch = instanceUrl.match(/^https:\/\/(?:[^@]*@)?(.*)\.(app|dev)\.medicmobile\.org(?:$|\/)/);
  if(productionUrlMatch &&
      productionUrlMatch[1] !== projectName &&
      productionUrlMatch[1] !== 'alpha') {
    warn(`Attempting to use project for \x1b[31m${projectName}\x1b[33m`,
        `against non-matching instance: \x1b[31m${redactBasicAuth(instanceUrl)}\x1b[33m`);
    if(!readline.keyInYN()) {
      error('User failed to confirm action.');
      process.exit(1);
    }
  }
}

let actions = args;
let extraArgs;

const argDivider = actions.indexOf('--');
if(argDivider !== -1) {
  extraArgs = actions.slice(argDivider + 1);
  actions = actions.slice(0, argDivider);
}

if(!actions.length) {
  actions = [
    'compile-app-settings',
    'backup-app-settings',
    'upload-app-settings',
    'convert-app-forms',
    'convert-collect-forms',
    'convert-contact-forms',
    'backup-all-forms',
    'delete-all-forms',
    'upload-app-forms',
    'upload-collect-forms',
    'upload-contact-forms',
    'upload-resources',
    'upload-custom-translations',
    'csv-to-docs',
    'upload-docs',
  ];
}

const unsupported = actions.filter(a => !supportedActions.includes(a));
if(unsupported.length) {
  error(`Unsupported action(s): ${unsupported.join(' ')}`);
  process.exit(1);
}

info(`Processing config in ${projectName} for ${instanceUrl}.`);
info('Actions:\n     -', actions.join('\n     - '));
info('Extra args:', extraArgs);

const initialPromise = actions.includes('check-for-updates') || skipCheckForUpdates ?
    Promise.resolve() : checkForUpdates({ nonFatal:true });

return actions.reduce((promiseChain, action) =>
    promiseChain
      .then(() => info(`Starting action: ${action}…`))
      .then(() => require(`../fn/${action}`)('.', couchUrl, extraArgs))
      .then(() => info(`${action} complete.`)),
    initialPromise)
  .then(() => { if(actions.length > 1) info('All actions completed.'); })
  .catch(e => {
    error(e);
    process.exit(1);
  });
