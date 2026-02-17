module.exports = (app, mod, build_number) => {
  let html = `

  
  <!DOCTYPE html>
  <html lang="en" data-theme="lite">
  
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Welcome to Saito" />
    <meta name="author" content="" />
    <link rel="stylesheet" type="text/css" href="/saito/saito.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href="/${mod.returnSlug()}/style.css?v=${build_number}" />

    <title>${mod.returnTitle()}</title>
  
    <script type="text/javascript" src="/saito/saito.js?build=${build_number}" async></script>
  
  </head>
  
  <body>
  ${mod.returnTitle()} is installed.
  </body>
  
  </html>
  
  `;

  return html;
};
