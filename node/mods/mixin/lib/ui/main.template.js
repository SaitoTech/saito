module.exports = (app, mod, build_number = '', og_card) => {
  let html = `
  
  <!DOCTYPE html>
  <html lang="en" data-theme="dark">
  
  <head>

    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="description" content="${app.browser.escapeHTML(mod.description)}" />
    <meta name="keywords" content="${mod.categories}"/>
    <meta name="author" content="Saito Team"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=yes" />
  
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" type="text/css" media="screen" />
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />
  
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="application-name" content="saito.io arcade" />
    <meta name="apple-mobile-web-app-title" content="Saito Asset Store" />
    <meta name="theme-color" content="#FFFFFF" />
    <meta name="msapplication-navbutton-color" content="#FFFFFF" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="msapplication-starturl" content="/index.html" />
  
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:site" content="${og_card.twitter}" />
    <meta name="twitter:creator" content="${og_card.twitter}" />
    <meta name="twitter:title" content="${og_card.title}" />
    <meta name="twitter:url" content="${og_card.url}" />
    <meta name="twitter:description" content="${og_card.description}"/>
    <meta name="twitter:image" content="${og_card.image}" />
  
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${og_card.title}" />
    <meta property="og:description" content="${og_card.description}" />
    <meta property="og:url" content="${og_card.url}" />
    <meta property="og:image" content="${og_card.image}" />
    <meta property="og:site_name" content="Saito Arcade" />
    <meta property="og:locale" content="en_US" />

    <link rel="icon" sizes="192x192" href="/saito/img/touch-icon-192x192.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch-icon-192x192.png" />
    <link rel="icon" sizes="512x512" href="/saito/img/touch-icon-512x512.png" />
    <link rel="apple-touch-icon" sizes="512x512" href="/saito/img/touch-icon-512x512.png" />
  
    <link rel="stylesheet" href="/saito/lib/pace/center-atom.css">
    <link rel="stylesheet" type="text/css" href="/saito/saito.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href="/mixin/style.css?v=${build_number}">

    <title>Purchase SAITO</title>
  
    <style type="text/css">

    body.buysaito-body::before {
      content: "";
      opacity: 1;
      z-index: 160;
      /*saito-header has z-index:15 */
      position: absolute;
      top: 0;
      left: 0;
      display: block;
      height: 100vh;
      width: 100vw;
      background-color: #1c1c23;
      background-image: url('/saito/img/tiled-logo.svg');
    }
  </style>
  </head>
  
  <body class="buysaito-body">
    <div class="buysaito-main">
    <div class="buysaito-withdraw-container">
      <h2>Buy SAITO</h2>
      <button type="button" id="mixin-buysaito-launch" class="saito-button-primary">Get SAITO</button>

      <div id="buysaito-amount-form" aria-live="polite">
        <p role="status">Checking available payment currencies...</p>
      </div>
      </div>
      <div class="buysaito-footer-note">Already have SAITO?<br>Visit our <a href="/migration">migration portal</a>.</div>
    </div>

  </body>

  <script type="text/javascript" src="/saito/saito.js?build=${build_number}" ></script>
  </html>`;

  return html;
};
