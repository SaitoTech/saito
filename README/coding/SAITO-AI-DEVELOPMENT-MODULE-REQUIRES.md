# Saito AI Development — Module Requires

The lite-client bundle is built by Webpack. Some request strings are externals. They are not loaded as JavaScript. Webpack writes them into `saito.js` as raw text:

```javascript
module.exports = ./publish.html;
```

Terser then fails the compile with:

```text
Unexpected token: punc (.)
```

The `.` it reports is the dot in that path. The failure is in the bundle, not in the module's own syntax.

## Do not require these suffixes

`node/config/build/webpack.config.cjs` treats a request as an external when it matches any of:

```javascript
/\.txt /,
/\.png$/,
/\.jpg$/,
/\.html$/,
/\.css$/,
/\.md$/,
/\.pdf$/,
/\.sql$/,
/\.sh$/,
/\.zip$/,
/\/web\//,
/\/www\//
```

The match is against the string passed to `require()`, before Node adds `.js`.

```javascript
require('./publish.html');
```

ends in `.html`, so it matches `/\.html$/`. The file `publish.html.js` is never loaded.

The same thing happens for `require('./README.md')`, `require('./style.css')`, `require('./card.png')`, and any other request that matches the list above.

## How modules include markup

Modules put interface markup in a JavaScript file whose name ends in `.template.js`. The require stops at `.template`.

```javascript
const LossTemplate = require('./loss.template');
```

That file is `loss.template.js`. Node resolves the missing `.js`. The request does not end in `.html`, `.css`, or `.md`, so Webpack bundles it as JavaScript.

Use the same shape for any shared helper that builds markup:

```javascript
const { escapeHTML } = require('./publish.escape');
```

The file is `publish.escape.js`. Do not name that require `./publish.html`.

A component and its markup stay side by side:

```text
lib/ui/overlays/settings.js
lib/ui/overlays/settings.template.js
```

```javascript
const SettingsTemplate = require('./settings.template');
```

Stylesheets are not required from JavaScript. A module lists them on `this.styles` as URLs, for example `'/saitosign/style.css'`. The browser loads that file on its own. `web/` and `www/` are also excluded from the bundle by `/\/web\//` and `/\/www\//`.

## Node-only libraries stay on the full node

The lite list in `node/config/modules.config.js` is the browser bundle. Webpack follows every `require()` and `import()` it can see from those entries, including imports inside `if (!app.BROWSER)`. A comment that a library is only used on the server does not keep it out of the bundle.

Do not give the lite client a Node-only library unless the browser itself must run that code. That includes `jsdom`, database drivers, proxy agents, and anything else that imports Node core modules such as `assert`, `fs`, `net`, or `tls`. Webpack 5 does not polyfill those modules, and the lite compile fails on the first one it cannot resolve.

Put server-only code in a file the lite entry never imports. The full node loads that file only when `app.BROWSER` is false:

```javascript
if (!app.BROWSER) {
  const loaded = await import(/* webpackIgnore: true */ './lib/server-only.js');
}
```

`import()` honors `/* webpackIgnore: true */`. The same comment on `require()` does nothing unless `module.parser.javascript.commonjsMagicComments` is enabled, which this repository does not enable. A variable passed to `require()` is also unsafe: Webpack may bundle every file in that directory.

When the browser needs a result from that server-only code, send a peer transaction. The server module receives it in `handlePeerTransaction()` and returns the response. The browser keeps the interface. The library stays on the node that can run it. [Module distribution](SAITO-DEVELOPMENT-MODULE-DISTRIBUTION-AND-RUNTIME-INSTALLATION.md) describes that server boundary.
