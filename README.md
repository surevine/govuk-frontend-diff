# govuk-frontend-diff

![Pipeline status](https://github.com/surevine/govuk-frontend-diff/workflows/Pipeline/badge.svg)
[![version](https://img.shields.io/npm/v/govuk-frontend-diff.svg?style=flat-square)](https://www.npmjs.com/package/govuk-frontend-diff)
[![MIT License](https://img.shields.io/npm/l/govuk-frontend-diff.svg?style=flat-square)](https://github.com/surevine/govuk-frontend-diff/blob/main/LICENSE)

Command line tool to compare a custom implementation of govuk-frontend templates with the reference Nunjucks.

The tools works by rendering the govuk-frontend Nunjucks templates using the [example data provided by govuk-frontend](https://github.com/alphagov/govuk-frontend/blob/main/packages/govuk-frontend/src/govuk/components/button/button.yaml) for each component. It then passes this same data to an http server (which you need to provide) and expects to receive html responses. It then compares the two using [https://github.com/markedjs/html-differ](https://github.com/markedjs/html-differ).

---

> NOTE: This repository will soon be all but obselete, since govuk-frontend includes fixtures directly in the package from 3.9.0 upwards. There are currently some issues with these (See https://github.com/alphagov/govuk-frontend/issues/1962) but once these are resolved, I will be moving my repositories to using these and deprecating this tool. I will of course leave it here in case anyone's using it, but it will no longer receive ongoing support

---

## Installation

### Using the binaries

Binaries for OSX, Linux and Windows are provided. The [latest binaries can be found here](https://github.com/surevine/govuk-frontend-diff/releases/latest).

Using the binaries does not require NodeJS to be installed.

_If you are have NodeJS available it is more optimal to run the script directly with NodeJS as shown below, since the binaries are quite large (Due to packaging up NodeJS and the required node_modules in the binary)._

### With NodeJS

If you wish, you can install govuk-frontend-diff globally: `npm install -g govuk-frontend-diff` or alternatively you can install it locally to your package and create a script entry in your package.json to run `govuk-frontend-diff` (Since npm automatically resolves paths to `node_modules/bin` scripts when they're run from package.json script entries).

#### Via npx

As with any cli tool published to the npm registry, you can simply run `npx govuk-frontend-diff`.

## Compatibility

Please note this tool will only work with versions of govuk-frontend later than `v3.0.0` (July 2019) wherein the components were moved underneath a `/govuk` subfolder. See https://github.com/alphagov/govuk-frontend/releases/tag/v3.0.0

## Usage

```
Usage: govuk-frontend-diff http://localhost:3000 --govuk-frontend-version=v5.0.0-beta.0
Usage: govuk-frontend-diff http://localhost:3000 --govuk-frontend-version=v5.0.0-beta.0
--exclude=page-template

Commands:
  govuk-frontend-diff <url>  URL to a server which will render your templates
                             for each component/template/params combination.

                             The html output from this will then be compared
                             against the reference Nunjucks templates.

                             This server must:

                             - Have /component/<component-name> and /template
                             routes which accept data POSTed as JSON
                             - Respond with rendered html

                             A reference server and more detailed instructions
                             can be found in the readme at
                             https://github.com/surevine/govuk-frontend-diff


Options:
  --help                    Show help                                  [boolean]
  --version                 Show version number                        [boolean]
  --govuk-frontend-version  Version of govuk-frontend to test against.
                            This will normally be references to tags like v5.0.0-beta.0
                            but this will accept any commit-ish such as branches
                            or even commit identifiers.
                            If not specified, the most recent govuk-frontend tag
                            will be used.
  --force-refresh           Force a re-download of govuk-frontend, bypassing the
                            cache. Useful if the version you are specifying
                            represents a branch.                       [boolean]
  --include                 Specify a subset of the tests to run. Should be one
                            or more names of components, space separated

                            For example --include accordion button       [array]
  --exclude                 Specify a subset of the tests to exclude. Should be
                            one or more names of components, space separated
                                                                         [array]
  --verbose, --ci           Verbose logging instead of a simple progress bar.
                            More suitable for CI situations where the progress
                            bar is not useful.                         [boolean]
  --hide-diffs              Hide the html diffs from output            [boolean]
  --ignore-attributes       Attributes to exclude from html diffing      [array]
  --skip-hidden             Skip examples from govuk-frontend that are marked as
                            "hidden"                                   [boolean]
```

## Creating the html server for govuk-frontend-diff

Below is a Python/Flask reference server (Lifted directly from https://github.com/LandRegistry/govuk-frontend-jinja/tests/utils/app.py).

You will need to create an equivalent of this in your desired Language / Framework.

The key points are:

- A `/template` route
- A `/components/<component-name>` route (where `<component-name>` will be the hyphenated name such as `character-count`)
- Both routes need to respond to POST requests and accept JSON payloads
- For the component route, the JSON payload contains `macro_name` and `params` keys.  
  `macro_name` is the camelcased version of the component name, such as `CharacterCount`.  
  `params` is the data which needs to be passed to the component macro / function / template or whatever construct the target language uses
- The component route should respond with the bare html for the component, with no wrapping `<html>`, `<body>` elements etc
- For the template route, the JSON payload contains the complete data which should be passed to the page template.

```python

import os
from jinja2 import FileSystemLoader, PrefixLoader
from flask import Flask, render_template_string, request

app = Flask(__name__)

app.jinja_loader = PrefixLoader({
    'govuk_frontend_jinja': FileSystemLoader(searchpath=os.path.join(os.path.dirname(__file__),
                                             '../../govuk_frontend_jinja/templates'))
})


# Template route
@app.route('/template', methods=['POST'])
def template():
    data = request.json

    # Construct a page template which can override any of the blocks if they are specified
    # This doesn't need to be inline - it could be it's own file
    template = '''
        {% extends "govuk_frontend_jinja/template.html" %}
        {% block pageTitle %}{% if pageTitle %}{{ pageTitle }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block headIcons %}{% if headIcons %}{{ headIcons }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block head %}{% if head %}{{ head }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block bodyStart %}{% if bodyStart %}{{ bodyStart }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block skipLink %}{% if skipLink %}{{ skipLink }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block header %}{% if header %}{{ header }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block main %}{% if main %}{{ main }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block beforeContent %}{% if beforeContent %}{{ beforeContent }}{% else %}{{ super() }}{% endif %}{% endblock %} # noqa: E501
        {% block content %}{% if content %}{{ content }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block footer %}{% if footer %}{{ footer }}{% else %}{{ super() }}{% endif %}{% endblock %}
        {% block bodyEnd %}{% if bodyEnd %}{{ bodyEnd }}{% else %}{{ super() }}{% endif %}{% endblock %}
    '''

    # Render the full html template
    return render_template_string(template, **data)


# Component route
@app.route('/component/<component>', methods=['POST'])
def component(component):
    data = request.json

    # Render the component using the data provided
    # component is the hyphenated component name e.g. character-count
    # data['macro_name'] is the camelcased name e.g. CharacterCount
    # data['params] are the params that will be passed to the macro
    # Returns an html response that is just the template in question - no wrapping <html>, <body> elements etc
    return render_template_string('''
        {{% from "govuk_frontend_jinja/components/" + component + "/macro.html" import govuk{macro_name} %}}
        {{{{ govuk{macro_name}(params) }}}}
    '''.format(macro_name=data['macro_name']),
        component=component,
        params=data['params']
    )

```
