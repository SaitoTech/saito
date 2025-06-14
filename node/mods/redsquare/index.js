module.exports = (app, mod, build_number, og_card, recent_tweets = []) => {

  let x = recent_tweets.slice(0, 10);

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

  <link rel="stylesheet" href="/saito/css-imports/saito-variables.css" />
  <link rel="stylesheet" href="/saito/css-imports/saito-header.css" />

  <link rel="stylesheet" href="/redsquare/css/redsquare-table.css" />
  <link rel="stylesheet" href="/redsquare/css/redsquare-saito.css" />
  <link rel="stylesheet" href="/redsquare/css/redsquare-revamp.css" />
  <link rel="stylesheet" href="/redsquare/css/redsquare-sidebar.css" />
  <link rel="stylesheet" href="/redsquare/css/redsquare-menu.css" />
  <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />
  
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="application-name" content="saito.io redsquare" />
  <meta name="apple-mobile-web-app-title" content="🟥 Saito P2P RedSquare" />
  <meta name="theme-color" content="#FFFFFF" />
  <meta name="msapplication-navbutton-color" content="#FFFFFF" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="msapplication-starturl" content="/index.html" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:site" content="${og_card.twitter}" />
  <meta name="twitter:creator" content="${og_card.twitter}" />
  <meta name="twitter:title" content="${app.browser.escapeHTML(og_card.title)}" />
  <meta name="twitter:url" content="${og_card.url}" />
  <meta name="twitter:description" content="${app.browser.escapeHTML(og_card.description)}" />
  <meta name="twitter:image" content="${og_card.image}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${app.browser.escapeHTML(og_card.title)}" />
  <meta property="og:url" content="${og_card.url}" />
  <meta property="og:description" content="${app.browser.escapeHTML(og_card.description)}"/>
  <meta property="og:site_name" content="${app.browser.escapeHTML(og_card.title)}" />
  <meta property="og:image" content="${og_card.image}"/>
  <meta property="og:image:url" content="${og_card.image}"/>
  <meta property="og:image:secure_url" content="${og_card.image}"/>

  <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
  <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
  <link rel="icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />
  <link rel="apple-touch-icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />

  <title>Saito RedSquare</title>

</head>
<body>
</body>`;
	html += `<script type="text/javascript">
  if (!tweets) { 
    var tweets = [];
  }`;

  for (let tweet of x) {
    html += ` tweets.push(\`${tweet}\`);`;
  }
  html += `</script>

<script type="text/javascript" src="/saito/saito.js?build=${build_number}"></script>
</html>`;
  return html;
};
