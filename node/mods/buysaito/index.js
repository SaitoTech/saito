module.exports = (app, mod, build_number = '', og_card) => {
  let html = `
  
  <!DOCTYPE html>
  <html lang="en" data-theme="raven">
  
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
    <meta name="twitter:title" content="${app.browser.escapeHTML(og_card.title)}" />
    <meta name="twitter:description" content="${app.browser.escapeHTML(og_card.description)}" />
    <meta name="twitter:image" content="${og_card.image}" />
  
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${app.browser.escapeHTML(og_card.title)}" />
    <meta property="og:description" content="${app.browser.escapeHTML(og_card.description)}"/>
    <meta property="og:site_name" content="Saito" />
    <meta property="og:image" content="${og_card.image}"/>
    <meta property="og:image:url" content="${og_card.image}"/>
    <meta property="og:image:secure_url" content="${og_card.image}"/>

    <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
    <link rel="icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />
    <link rel="apple-touch-icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />

    <script type="text/javascript" src="/saito/lib/jquery/jquery-3.2.1.min.js"></script>
    <script data-pace-options='{ "restartOnRequestAfter" : false, "restartOnPushState" : false}' src="/saito/lib/pace/pace.min.js"></script>
    <link rel="stylesheet" href="/saito/lib/pace/center-atom.css">
    <link rel="stylesheet" type="text/css" href="/saito/saito.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href="/${mod.returnSlug()}/style.css?v=${build_number}">

    <title>Purchase SAITO</title>
  
    <style type="text/css">

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
      background-color: #1c1c23;
      background-image: url('/saito/img/tiled-logo.svg');
    }
  </style>
  </head>
  
  <body>
    <div class="main">
    <div class="withdraw-container">
      <h2>Buy SAITO</h2>

      <div class="buysaito-main-form">
        <div class="buysaito-form-card">
          <div class="trade-section-label">Pay With</div>
          <div class="crypto-box buysaito-pay-row">
            <div class="buysaito-token-fixed buysaito-token-dropdown">
              <div class="buysaito-custom-select" id="purchase-pay-crypto">
                <button class="buysaito-select-trigger" id="purchase-pay-crypto-trigger" type="button">
                  <span class="buysaito-select-option buysaito-select-current">
                    <span class="crypto-logo-container" id="purchase-pay-logo">
                      <img class="crypto-logo" src="/saito/img/logo.svg" />
                    </span>
                    <span class="buysaito-select-option-label buysaito-select-trigger-label">Loading...</span>
                  </span>
                  <i class="fa-solid fa-chevron-down"></i>
                </button>
                <div class="buysaito-select-menu hidden" id="purchase-pay-crypto-menu"></div>
              </div>
            </div>
            <input type="number" autocomplete="off" min="0" max="9999999999.99999999" step="0.00000001" class="purchase-saito-amount buysaito-input" id="purchase-pay-amount" value="" placeholder="0.0">
          </div>

          <div class="buysaito-percent-row" id="purchase-percent-row">
            <button class="saito-button-secondary purchase-percent-btn hidden" data-percent="12.5">12.5%</button>
            <button class="saito-button-secondary purchase-percent-btn hidden" data-percent="25">25%</button>
            <button class="saito-button-secondary purchase-percent-btn hidden" data-percent="50">50%</button>
            <button class="saito-button-secondary purchase-percent-btn hidden" data-percent="75">75%</button>
            <button class="saito-button-secondary purchase-percent-btn hidden" data-percent="100">MAX</button>
          </div>
        </div>

        <div class="buysaito-form-card">
          <div class="trade-section-label">Receive</div>
          <div class="crypto-box buysaito-receive-row">
            <div class="buysaito-token-fixed">
              <img class="crypto-logo" src="/saito/img/touch/pwa-192x192.png" />
              <span>SAITO</span>
            </div>
            <input type="number" autocomplete="off" min="0" max="9999999999" step="1" class="purchase-saito-amount buysaito-input" id="purchase-saito-amount" value="" placeholder="0">
          </div>
        </div>
      </div>

      <div class='saito-button-row auto-size'>
        <button class="saito-button-primary buysaito-button fat" id="buysaito-button" disabled>Buy</button>
      </div>
      </div>
      <div class="footer-note">Already have SAITO?<br>Visit our <a href="/migration">migration portal</a>.</div>
    </div>

  </body>

  <script type="text/javascript" src="/saito/saito.js?build=${build_number}" ></script>
  </html>`;

  return html;
};
