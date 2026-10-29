module.exports = (buildNumber = '') => {
  const version = buildNumber ? `?v=${buildNumber}` : '';
  return `<!doctype html>
<html lang="en" data-theme="noir">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="description" content="Saito Network" />
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" type="text/css" media="screen" />
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />
    <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
    <title>Saito Mainnet: Token Transfers</title>
    <link rel="stylesheet" href="/saito/saito.css${version}" />
    <link rel="stylesheet" href="/mixin/css/migration.css${version}" />
  </head>
  <body>
    <script type="text/javascript" src="/saito/saito.js${version}" id="saito"></script>
  </body>
</html>`;
};
