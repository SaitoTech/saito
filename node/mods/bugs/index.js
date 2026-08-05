const CtaLoader = require('../../lib/templates/saito-cta-loader.template');

const bugsLoader = () => `
  <div class="saito-cta-loader-shell" data-saito-cta-loader="bugs">
    <div class="saito-cta-loader-card">
      <div class="bugs-loader-brand" role="img" aria-label="Saito Bugs">
        <i class="fa-solid fa-bug" aria-hidden="true"></i>
        <span>Saito Bugs</span>
      </div>
      <div class="saito-cta-loader-subtitle">There Will Be Bugs</div>
      <div class="saito-cta-loader-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="saito-cta-loader-progress-fill"></div>
        <div class="saito-cta-loader-progress-text">0%</div>
      </div>
    </div>
  </div>`;

module.exports = (app, mod, buildNumber, ogCard = mod.social) => {
  const escape = (value) => app.browser.escapeHTML(String(value || ''));
  return `<!DOCTYPE html>
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content="${escape(ogCard.description)}" />
        <meta name="keywords" content="${escape(mod.categories)}" />
        <link rel="icon" href="/favicon.ico?v=2" />
        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" />
        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" />
        ${CtaLoader.head()}
        <link rel="stylesheet" href="/saito/saito.css?v=${buildNumber}" />
        <link rel="stylesheet" href="/redsquare/style.css?v=${buildNumber}" />
        <link rel="stylesheet" href="/bugs/base-candidates.css?v=${buildNumber}" />
        <link rel="stylesheet" href="/bugs/bugs.css?v=${buildNumber}" />
        <link rel="stylesheet" href="/bugs/bug-detail.css?v=${buildNumber}" />
        <title>${escape(mod.returnName())}</title>
      </head>
      <body class="bugs-body saito-cta-loader-active">
        ${bugsLoader()}
        <div id="saito-container" class="saito-container"></div>
        <script src="/saito/saito.js?build=${buildNumber}"></script>
      </body>
    </html>`;
};
