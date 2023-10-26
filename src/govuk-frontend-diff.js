const nunjucks = require('nunjucks');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cliProgress = require('cli-progress');
const prettyhtml = require('@starptech/prettyhtml');
const yaml = require('js-yaml');
const got = require('got');
const chalk = require('chalk');
const { HtmlDiffer } = require('@markedjs/html-differ');
const diffLogger = require('@markedjs/html-differ/lib/logger');
const getGovukComponentList = require('./get-govuk-component-list');
const fetchGovukFrontend = require('./fetch-govuk-frontend');
const config = require('./config');

const testProgress = new cliProgress.SingleBar(
  {
    format: 'Running tests {bar} {percentage}% | ETA: {eta}s | {value}/{total}',
  },
  cliProgress.Presets.shades_classic
);

function cleanHtml(dirtyHtml) {
  return prettyhtml(dirtyHtml, {
    sortAttributes: true,
  }).contents;
}

async function diffSingleComponentExample(
  component,
  example,
  renderCallback,
  nunjucksEnv,
  htmlDiffer,
  options
) {
  if (options.skipHidden && example.hidden) {
    return Promise.resolve({
      skipped: true,
    });
  }

  if (options.verbose) {
    console.log('Testing', component, '->', example.name);
  }

  const expected = cleanHtml(
    nunjucksEnv.render(
      path.join(
        'packages/govuk-frontend/src/govuk/components',
        component,
        'template.njk'
      ),
      {
        params: example.data,
      }
    )
  );

  const actual = cleanHtml(
    await renderCallback({ component, params: example.data })
  );

  const isEqualPromise = htmlDiffer.isEqual(actual, expected);
  const diffPromise = htmlDiffer.diffHtml(actual, expected);

  return Promise.all([isEqualPromise, diffPromise]).then(function (result) {
    return {
      passed: result[0],
      example: example.name,
      diff: result[1],
    };
  });
}

async function diffSingleComponent(
  component,
  version,
  renderCallback,
  nunjucksEnv,
  htmlDiffer,
  options
) {
  const examples = yaml.safeLoad(
    fs.readFileSync(
      path.join(
        config.tempDirectory,
        version,
        'packages/govuk-frontend/src/govuk/components',
        component,
        `${component}.yaml`
      ),
      'utf8'
    )
  );

  const results = await Promise.all(
    examples.examples.map((example) =>
      diffSingleComponentExample(
        component,
        example,
        renderCallback,
        nunjucksEnv,
        htmlDiffer,
        options
      )
    )
  );

  if (!options.verbose) {
    testProgress.increment();
  }

  return new Promise(function (resolve, reject) {
    resolve({
      component,
      results,
    });
  });
}

async function diffTemplate(
  version,
  renderCallback,
  nunjucksEnv,
  htmlDiffer,
  options
) {
  const examples = [
    {
      name: 'simple use case overriding the most common elements',
      data: {
        pageTitle: '<p>pageTitle</p>',
        header: '<p>header</p>',
        content: '<p>content</p>',
        footer: '<p>footer</p>',
      },
    },
    {
      name: 'everything overridden except main block',
      data: {
        // Variables
        htmlLang: 'htmlLang',
        htmlClasses: 'htmlClasses',
        pageTitleLang: 'pageTitleLang',
        themeColor: 'themeColor',
        bodyClasses: 'bodyClasses',
        bodyAttributes: {
          foo: 'bar',
          wibble: 'bob',
        },
        containerClasses: 'containerClasses',
        mainClasses: 'mainClasses',
        mainLang: 'mainLang',
        // Blocks
        pageTitle: '<p>pageTitle</p>',
        headIcons: '<p>headIcons</p>',
        head: '<p>head</p>',
        bodyStart: '<p>bodyStart</p>',
        skipLink: '<p>skipLink</p>',
        header: '<p>header</p>',
        beforeContent: '<p>beforeContent</p>',
        content: '<p>content</p>',
        footer: '<p>footer</p>',
        bodyEnd: '<p>bodyEnd</p>',
      },
    },
    {
      name: 'override main block',
      data: {
        main: '<p>footer</p>',
      },
    },
  ];

  const results = await Promise.all(
    examples.map((example) =>
      (async () => {
        if (options.verbose) {
          console.log('Testing page-template', '->', example.name);
        }

        const expected = cleanHtml(
          nunjucksEnv.render('base-template.njk', example.data)
        );

        const actual = cleanHtml(
          await renderCallback({ template: true, params: example.data })
        );

        const isEqualPromise = htmlDiffer.isEqual(actual, expected);
        const diffPromise = htmlDiffer.diffHtml(actual, expected);

        return Promise.all([isEqualPromise, diffPromise]).then(function (
          result
        ) {
          return {
            passed: result[0],
            example: example.name,
            diff: result[1],
          };
        });
      })()
    )
  );

  if (!options.verbose) {
    testProgress.increment();
  }

  return new Promise(function (resolve, reject) {
    resolve({
      component: 'page-template',
      results,
    });
  });
}

async function diffComponentAgainstReferenceNunjucks(
  requestedVersion,
  renderCallback,
  options
) {
  const htmlDiffer = new HtmlDiffer({
    ignoreAttributes: options.ignoreAttributes,
    ignoreSelfClosingSlash: true,
  });

  let version = requestedVersion;

  // If no version supplied, work out what the latest tagged version of govuk-frontend is
  if (!requestedVersion) {
    const latestRelease = await got
      .get(
        'https://api.github.com/repos/alphagov/govuk-frontend/releases/latest'
      )
      .json();
    version = latestRelease.tag_name;
  }

  await fetchGovukFrontend(version, options);
  const components = getGovukComponentList(version, options).filter((item) => {
    if (options.exclude && options.exclude.includes(item)) {
      return false;
    }

    if (options.include && !options.include.includes(item)) {
      return false;
    }

    return true;
  });

  const testPageTemplate =
    (options.exclude && !options.exclude.includes('page-template')) ||
    (options.include && options.include.includes('page-template')) ||
    (!options.include && !options.exclude);

  if (!options.verbose) {
    testProgress.start(components.length + (testPageTemplate ? 1 : 0));
  }

  const nunjucksEnv = new nunjucks.Environment([
    new nunjucks.FileSystemLoader(__dirname),
    new nunjucks.FileSystemLoader(path.join(config.tempDirectory, version)),
  ]);

  const promises = components.map((component) =>
    diffSingleComponent(
      component,
      version,
      renderCallback,
      nunjucksEnv,
      htmlDiffer,
      options
    )
  );

  if (testPageTemplate) {
    promises.push(
      diffTemplate(version, renderCallback, nunjucksEnv, htmlDiffer, options)
    );
  }

  const results = await Promise.all(promises);

  if (!options.verbose) {
    testProgress.stop();
  }

  const resultsTitle = chalk.whiteBright.bold('Results');
  console.log(os.EOL);
  console.group(resultsTitle);

  let total = 0;
  let totalPassed = 0;
  let totalFailed = 0;

  results.forEach((result) => {
    const groupName = chalk.whiteBright.bold(result.component);
    console.group(groupName);

    result.results
      .filter((item) => !item.skipped)
      .forEach((individualResult) => {
        total += 1;

        console.log(
          chalk.whiteBright.bold('→'),
          individualResult.example,
          individualResult.passed
            ? chalk.greenBright.bold('✔')
            : chalk.redBright.bold('✘')
        );
        if (individualResult.passed) {
          totalPassed += 1;
        } else {
          if (!options.hideDiffs) {
            diffLogger.logDiffText(individualResult.diff, {
              charsAroundDiff: 80,
            });
            console.log(os.EOL);
          }
          totalFailed += 1;
        }
      });

    console.groupEnd(groupName);
  });
  console.groupEnd(resultsTitle);

  const summaryTitle = chalk.whiteBright.bold('Summary');
  console.log(os.EOL);
  console.group(summaryTitle);
  console.log(total, 'tests.');
  console.log(
    chalk.greenBright(totalPassed),
    'passed and',
    chalk.redBright(totalFailed),
    'failed'
  );
  console.groupEnd(summaryTitle);

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

module.exports = diffComponentAgainstReferenceNunjucks;
