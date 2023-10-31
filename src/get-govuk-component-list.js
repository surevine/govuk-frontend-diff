const path = require('path');
const glob = require('glob');
const config = require('./config');

function getGovukComponentList(version) {
  const govukComponentPath = path.join(
    config.tempDirectory,
    version,
    'packages/govuk-frontend/src/govuk/components'
  );
  return glob
    .sync(path.join(govukComponentPath, '**/macro.njk'))
    .map((componentPath) =>
      path.relative(govukComponentPath, path.dirname(componentPath))
    );
}

module.exports = getGovukComponentList;
