module.exports = (app, mod, build_number) => {
  return `
    <!DOCTYPE html>
    <html lang="en" data-theme="noir">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />

        <meta name="description" content="${app.browser.escapeHTML(mod.description)}" />
        <meta name="keywords" content="${mod.categories}" />
        <meta name="author" content="Saito 🟥" />

        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#FFFFFF" />

        <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />

        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" type="text/css" media="screen" />
        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />

        <script data-pace-options='{ "restartOnRequestAfter" : false, "restartOnPushState" : false}' src="/saito/lib/pace/pace.min.js"></script>
        <link rel="stylesheet" href="/saito/lib/pace/center-atom.css" />

        <link rel="stylesheet" href="/saito/saito.css?v=${build_number}" />
        <link rel="stylesheet" href="/redsquare/style.css?v=${build_number}" />

        <title>Saito RedSquare</title>
      </head>
      <body class="redsquare-body">
        <div id="saito-container" class="saito-container"></div>
        <script type="text/javascript" src="/saito/saito.js?build=${build_number}"></script>
      </body>
    </html>
  `;
};
