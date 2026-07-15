module.exports = (app, mod, build_number, og_card = mod.social) => {

  return `
    <!DOCTYPE html>
    <html lang="en" data-theme="noir">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="X-UA-Compatible" content="IE=edge" />

        <meta name="description" content="${app.browser.escapeHTML(og_card.description)}" />
        <meta name="keywords" content="${mod.categories}" />
        <meta name="author" content="Saito 🟥" />

        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#FFFFFF" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content="${og_card.twitter}" />
	<meta name="twitter:creator" content="${og_card.twitter}" />
	<meta name="twitter:title" content="${app.browser.escapeHTML(og_card.title)}" />
	<meta name="twitter:url" content="${og_card.url}" />
	<meta name="twitter:description" content="${app.browser.escapeHTML(og_card.description)}" />
	<meta name="twitter:image" content="${og_card.image}" />

	<meta property="og:type" content="website" />
	<meta property="og:title" content="${app.browser.escapeHTML(og_card.title)}" />
	<meta property="og:url" content="${og_card.url}" />
	<meta property="og:description" content="${app.browser.escapeHTML(og_card.description)}" />
	<meta property="og:site_name" content="Saito" />
	<meta property="og:image" content="${og_card.image}" />
	<meta property="og:image:url" content="${og_card.image}" />
	<meta property="og:image:secure_url" content="${og_card.image}" />

        <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
        <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />

        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" type="text/css" media="screen" />
        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />

        <script data-pace-options='{ "restartOnRequestAfter" : false, "restartOnPushState" : false}' src="/saito/lib/pace/pace.min.js"></script>
        <link rel="stylesheet" href="/saito/lib/pace/center-atom.css" />

        <link rel="stylesheet" href="/saito/saito.css?v=${build_number}" />
        <link rel="stylesheet" href="/redsquare/style.css?v=${build_number}" />

        <title>Saito RedSquare - ${app.browser.escapeHTML(og_card.title)}</title>
      </head>
      <body class="redsquare-body">
        <div id="saito-container" class="saito-container"></div>
        <script type="text/javascript" src="/saito/saito.js?build=${build_number}"></script>
      </body>
    </html>
  `;
};
