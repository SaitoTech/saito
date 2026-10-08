const CtaLoader = require('../../lib/templates/saito-cta-loader.template');

module.exports = (app, mod, build_number, social = mod.social) => {
  const card = {};
  for (const [key, value] of Object.entries(social)) {
    card[key] = app.browser.escapeHTML(String(value || ''));
  }
  return `
    <!DOCTYPE html>
    <html data-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />

  <title>${card.title}</title>
  <meta name="description" content="${card.description}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Saito Store" />
  <meta property="og:title" content="${card.title}" />
  <meta property="og:description" content="${card.description}" />
  <meta property="og:url" content="${card.url}" />
  <meta property="og:image" content="${card.image}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="${card.twitter}" />
  <meta name="twitter:title" content="${card.title}" />
  <meta name="twitter:description" content="${card.description}" />
  <meta name="twitter:url" content="${card.url}" />
  <meta name="twitter:image" content="${card.image}" />
  <meta name="keywords" content="${mod.categories}"/>
  <meta name="author" content="Saito 🟥"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=yes" />

  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="application-name" content="saito.io redsquare" />
  <meta name="apple-mobile-web-app-title" content="🟥 Saito P2P RedSquare" />
  <meta name="theme-color" content="#FFFFFF" />
  <meta name="msapplication-navbutton-color" content="#FFFFFF" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="msapplication-starturl" content="/index.html" />

  <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
  <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
  <link rel="icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />
  <link rel="apple-touch-icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />

  <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" type="text/css" media="screen" />
  <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />

  <script data-pace-options='{ "restartOnRequestAfter" : false, "restartOnPushState" : false}' src="/saito/lib/pace/pace.min.js"></script>
  <link rel="stylesheet" href="/saito/lib/pace/center-atom.css">
  ${CtaLoader.head('store')}

  <link rel="stylesheet" href="/saito/saito.css" />
  <link rel="stylesheet" href="/store/style.css">
      </head>
      <body class="saito-cta-loader-active">
        ${CtaLoader.loader('store')}
        <div id="saito-container" class="saito-container"></div>
      </body>
      <script type="text/javascript" src="/saito/saito.js?build=${build_number}"></script>
    </html>
  `;
};
