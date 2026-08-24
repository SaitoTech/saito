module.exports = (app, mod, buildNumber) => `
<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${app.browser.escapeHTML(mod.description)}" />
    <title>${mod.appname}</title>
    <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" />
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" />
    <link rel="stylesheet" href="/saito/lib/nftstudio/codemirror.min.css" />
    <link rel="stylesheet" href="/saito/saito.css?v=${buildNumber}" />
    <link rel="stylesheet" href="/nftstudio/style.css?v=${buildNumber}" />
  </head>
  <body>
    <header class="saito-header"></header>
    <div id="saito-container" class="saito-container"></div>
    <script src="/saito/lib/nftstudio/codemirror.min.js"></script>
    <script src="/saito/lib/nftstudio/javascript.min.js"></script>
    <script src="/saito/lib/nftstudio/css.min.js"></script>
    <script src="/saito/lib/nftstudio/acorn.min.js"></script>
    <script src="/saito/lib/nftstudio/csstree.min.js"></script>
    <script src="/saito/saito.js?build=${buildNumber}"></script>
  </body>
</html>
`;
