const CtaLoader = require('./saito-cta-loader.template');
const initializeLoader = require('../saito/dynamic-module-loader');

module.exports = (buildNumber) => `<!DOCTYPE html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Loading | Saito</title>
    <link rel="icon" href="/favicon.ico?v=2" />
    <link rel="stylesheet" href="/saito/saito.css?v=${buildNumber}" />
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" />
    ${CtaLoader.styles()}
    <noscript><meta http-equiv="refresh" content="0;url=/404.html" /></noscript>
  </head>
  <body class="saito-cta-loader-active">
    <div class="saito-cta-loader-shell" aria-busy="true">
      <div class="saito-cta-loader-card">
        <div class="saito-cta-loader-logo" role="img" aria-label="Saito"
          style="--saito-cta-loader-logo-mask: url('/saito/img/logo.svg')"></div>
        <div class="saito-cta-loader-progress is-application-loading" role="status">
          <div class="saito-cta-loader-progress-fill"></div>
          <div class="saito-cta-loader-progress-text" aria-live="polite">Checking for Dynamic Modules...</div>
        </div>
        <a href="" data-saito-loader-retry hidden>Retry</a>
      </div>
    </div>
    <script>(${initializeLoader.toString()})(window);</script>
    <script id="saito" src="/saito/saito.js?build=${buildNumber}"
      onerror="window.SaitoDynamicLoader.fail()"></script>
  </body>
</html>`;
