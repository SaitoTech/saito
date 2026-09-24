module.exports = (app, mod, build_number = '') => {
  const description = app.browser.escapeHTML(mod.description || '');
  const title = app.browser.escapeHTML(mod.returnTitle());

  return `
    <!DOCTYPE html>
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="${description}" />
        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" />
        <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" />
        <link rel="stylesheet" href="/saito/saito.css?v=${build_number}" />
        <link rel="stylesheet" href="/saitosign/style.css?v=${build_number}" />
        <title>${title}</title>
      </head>
      <body>
        <div id="saito-container" class="saito-container saitosign"></div>
        <script src="/saito/saito.js?build=${build_number}"></script>
      </body>
    </html>
  `;
};
