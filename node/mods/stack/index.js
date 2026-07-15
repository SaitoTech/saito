const CtaLoader = require('../../lib/templates/saito-cta-loader.template');

module.exports = (app, mod, build_number, og_card = {}, initialPostSerialized = null) => {
  console.log(og_card);

  let html = `

<!DOCTYPE html>
<html lang="en" data-theme="dark">

<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  
  <meta name="description" content="${app.browser.escapeHTML(mod.description)}" />
  <meta name="keywords" content="${mod.categories}"/>
  <meta name="author" content="Saito 🟥"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=yes" />

  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="application-name" content="saito.io stack" />
  <meta name="apple-mobile-web-app-title" content="🟥 Saito P2P Stack" />
  <meta name="theme-color" content="#FFFFFF" />
  <meta name="msapplication-navbutton-color" content="#FFFFFF" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="msapplication-starturl" content="/index.html" />

  <meta name="twitter:card" content="https://saito.io/stack/img/splash.png" />
  <meta name="twitter:site" content="${og_card.twitter}" />
  <meta name="twitter:creator" content="${og_card.twitter}" />
  <meta name="twitter:title" content="${og_card.title}" />
  <meta name="twitter:url" content="${og_card.url}" />
  <meta name="twitter:description" content="${og_card.description}" />
  <meta name="twitter:image" content="${og_card.image}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${og_card.title}" />
  <meta property="og:url" content="${og_card.url}" />
  <meta property="og:description" content="${og_card.description}"/>
  <meta property="og:site_name" content="Saito" />
  <meta property="og:image" content="${og_card.image}"/>
  <meta property="og:image:url" content="${og_card.image}"/>
  <meta property="og:image:secure_url" content="${og_card.image}"/>
  <meta property="og:image:secure_url" content="https://saito.io/stack/img/splash.png"/>

  <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
  <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
  <link rel="icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />
  <link rel="apple-touch-icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />

  <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" type="text/css" media="screen" />
  <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />
  
  <script data-pace-options='{ "restartOnRequestAfter" : false, "restartOnPushState" : false}' src="/saito/lib/pace/pace.min.js"></script>
  <link rel="stylesheet" href="/saito/lib/pace/center-atom.css">

  ${CtaLoader.head('stack')}
  <link rel="stylesheet" type="text/css" href="/saito/saito.css?v=${build_number}" />

  <title>Saito Stack</title>
  <meta name="description" content="Stack - Permissioned Blogging">


    <style type="text/css">
    /* css for fade-out bg effect while content is loading */
    body::before {
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
      /* hardcode bg colors used because saito-variables arent accessible here */
      background-color: #1c1c23;
      background-image: url('/saito/img/tiled-logo.svg');
    }

    .pace {
      width: 300px;
      height: 300px;
      background: transparent;
      overflow: visible;
    }

    .pace::before {
      content: "";
      position: absolute;
      inset: 0;
      background: var(--dreamscape);
      border-radius: 50%;
      animation: pace-theme-center-atom-spin 6s linear infinite;
    }

    .pace .pace-progress:after {
      top: calc(100% + 2.5rem);
      color: #fff;
      font-size: 32px;
      text-shadow: 1px 1px 2px #000;
      transform: translateX(-50%);
    }

    .pace .pace-activity {
      width: 290px;
      height: 290px;
      top: 0;
      left: 0;
      background-image: url('/saito/icons/saito-stack-icon-outline-label.svg');
      background-size: 190px 190px;
      background-position: center;
      background-repeat: no-repeat;
      animation: pace-icon-throb 1.2s ease-in-out infinite;
    }

    @keyframes pace-icon-throb {
      0%,
      100% {
        background-size: 175px 175px;
      }

      50% {
        background-size: 190px 190px;
      }
    }
  </style>

</head>
<body class="saito-cta-loader-active">
  ${CtaLoader.loader('stack')}
  <div class="saito-container hide-scrollbar" id="saito-container"></div>
</body>
`;
  if (initialPostSerialized) {
    html += `<script>window.__STACK_INITIAL_POST = JSON.parse(${JSON.stringify(initialPostSerialized)});</script>\n`;
  }
  html += `<script type="text/javascript" src="/saito/saito.js?build=${build_number}"></script>
</html>`;
  return html;
};
