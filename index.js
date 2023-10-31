#!/usr/bin/env node

const yargs = require('yargs');
const got = require('got');
const diffComponentAgainstReferenceNunjucks = require('./src/govuk-frontend-diff');

process.on('unhandledRejection', (err) => {
  throw err;
});

function hyphenatedToCamel(string) {
  return string
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}

async function performDiff(url, version, options) {
  await diffComponentAgainstReferenceNunjucks(
    version,
    async function (args) {
      if (args.template) {
        return got
          .post(`${url}/template`, {
            json: args.params,
          })
          .text();
      }

      return got
        .post(`${url}/component/${args.component}`, {
          json: {
            params: args.params,
            macro_name: hyphenatedToCamel(args.component),
          },
        })
        .text();
    },
    options
  );
}

const { argv } = yargs
  .scriptName('govuk-frontend-diff')
  .usage('Usage: $0 http://localhost:3000 --govuk-frontend-version=v5.0.0-beta.0')
  .usage(
    'Usage: $0 http://localhost:3000 --govuk-frontend-version=v5.0.0-beta.0 --exclude=page-template'
  )
  .option('govuk-frontend-version', {
    describe: `Version of govuk-frontend to test against.    
    This will normally be references to tags like v5.0.0-beta.0 but this will accept any commit-ish such as branches or even commit identifiers.
    If not specified, the most recent govuk-frontend tag will be used.`,
  })
  .option('force-refresh', {
    type: 'boolean',
    describe:
      'Force a re-download of govuk-frontend, bypassing the cache. Useful if the version you are specifying represents a branch.',
  })
  .option('include', {
    array: true,
    conflicts: 'exclude',
    describe: `Specify a subset of the tests to run. Should be one or more names of components, space separated
      
      For example --include accordion button`,
  })
  .option('exclude', {
    array: true,
    conflicts: 'include',
    describe:
      'Specify a subset of the tests to exclude. Should be one or more names of components, space separated',
  })
  .option('verbose', {
    type: 'boolean',
    alias: 'ci',
    describe:
      'Verbose logging instead of a simple progress bar. More suitable for CI situations where the progress bar is not useful.',
  })
  .option('hide-diffs', {
    type: 'boolean',
    describe: 'Hide the html diffs from output',
  })
  .option('ignore-attributes', {
    array: true,
    describe: 'Attributes to exclude from html diffing',
  })
  .option('skip-hidden', {
    type: 'boolean',
    describe: 'Skip examples from govuk-frontend that are marked as "hidden"',
  })
  .command(
    '<url>',
    `URL to a server which will render your templates for each component/template/params combination.
    
    The html output from this will then be compared against the reference Nunjucks templates.

    This server must:

    - Have /component/<component-name> and /template routes which accept data POSTed as JSON
    - Respond with rendered html

    A reference server and more detailed instructions can be found in the readme at https://github.com/surevine/govuk-frontend-diff
    `
  )
  .demandCommand(1);

performDiff(argv._[0], argv['govuk-frontend-version'], {
  forceRefresh: argv['force-refresh'],
  include: argv.include,
  exclude: argv.exclude,
  verbose: argv.verbose,
  hideDiffs: argv['hide-diffs'],
  ignoreAttributes: argv['ignore-attributes'] || [],
  skipHidden: argv['skip-hidden'],
});
