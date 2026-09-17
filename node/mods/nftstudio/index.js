module.exports = (app, mod, buildNumber, social = mod.social) => `
<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${app.browser.escapeHTML(mod.description)}" />
    <title>${mod.appname}</title>
    <link rel="canonical" href="${app.browser.escapeHTML(social.url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Saito" />
    <meta property="og:title" content="${app.browser.escapeHTML(social.title)}" />
    <meta property="og:description" content="${app.browser.escapeHTML(social.description)}" />
    <meta property="og:url" content="${app.browser.escapeHTML(social.url)}" />
    <meta property="og:image" content="${app.browser.escapeHTML(social.image)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${app.browser.escapeHTML(social.image_alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="${app.browser.escapeHTML(social.twitter)}" />
    <meta name="twitter:title" content="${app.browser.escapeHTML(social.title)}" />
    <meta name="twitter:description" content="${app.browser.escapeHTML(social.description)}" />
    <meta name="twitter:url" content="${app.browser.escapeHTML(social.url)}" />
    <meta name="twitter:image" content="${app.browser.escapeHTML(social.image)}" />
    <meta name="twitter:image:alt" content="${app.browser.escapeHTML(social.image_alt)}" />
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
