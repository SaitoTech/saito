module.exports = (app, mod, build_number, og_card, include_loader = true) => {
  let html = `

  
  <!DOCTYPE html>
  <html lang="en" data-theme="lite">
  
  <head>

    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="description" content="${app.browser.escapeHTML(
      app.browser.sanitize(mod.description)
    )}" />
    <meta name="keywords" content="${mod.categories}"/>
    <meta name="author" content="${og_card.creator}"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
  
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" type="text/css" media="screen" />
    <link rel="stylesheet" href="/saito/lib/font-awesome-6/css/all.css" type="text/css" media="screen" />
  
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="application-name" content="${mod.returnTitle()}" />
    <meta name="apple-mobile-web-app-title" content="${mod.returnTitle()}" />
    <meta name="theme-color" content="#FFFFFF" />
    <meta name="msapplication-navbutton-color" content="#FFFFFF" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="msapplication-starturl" content="/index.html" />
  
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:site" content="${og_card.twitter}" />
    <meta name="twitter:creator" content="${og_card.creator}" />
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
    <meta property="og:image:secure_url" content="${og_card.image.replace('http://', 'https://')}"/>
  
    <link rel="icon" media="all"  type="image/x-icon"  href="/favicon.ico?v=2"/>
    <link rel="icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
    <link rel="apple-touch-icon" sizes="192x192" href="/saito/img/touch/pwa-192x192.png" />
    <link rel="icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />
    <link rel="apple-touch-icon" sizes="512x512" href="/saito/img/touch/pwa-512x512.png" />

    <script type="text/javascript" src="/saito/lib/jquery/jquery-3.2.1.min.js"></script>
    <script type="text/javascript" src="/saito/lib/jquery/jquery-ui.min.js"></script>
    <script type="text/javascript" src="/saito/lib/hammer/hammer.min.js"></script>
    
    <script data-pace-options='{ "restartOnRequestAfter" : false, "restartOnPushState" : false}' src="/saito/lib/pace/pace.min.js"></script>
    <link rel="stylesheet" href="/saito/lib/pace/center-atom.css">
    
    <link rel="stylesheet" type="text/css" href="/saito/lib/jquery/jquery-ui.min.css" media="screen"/>

    <link rel="stylesheet" type="text/css" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" media="screen"/>
    <link rel="stylesheet" type="text/css" href="/saito/lib/font-awesome-6/css/all.css" media="screen"/>


    <link rel="stylesheet" type="text/css" href="/saito/saito.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href="/arcade/style.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href="/saito/game.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href="/${mod.returnSlug()}/style.css?v=${build_number}" />


    <title>${mod.returnTitle()}</title>
  
    <style type="text/css">
      #game-loader-screen{
        position: fixed; 
        width: 100vw;
        height: 100vh;
        background: black;
        z-index: 16;
        top: 0;
        left: 0;
      }

      .game-loader-backdrop {
        width: 100vw;
        height: 100vh;
        background-size: cover;
        position: absolute;
        filter: brightness(0.6);
      }

      .game-loader-backdrop + img{
        max-width: 80vw;
        height: auto;
        position: absolute;
        left: 50%;
        top: 50%;
        border-radius: 3rem;
        border: 1px solid var(--saito-border-color);
        transform: translate(-50%,-50%);
      }

      .game-loader-backdrop + .saito-loader-container{
        width: min(40rem, 90vw);
        height: min(10rem, 20vw);
        position: absolute;
        margin: min(5rem, 5vw);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background-color: rgba(230, 230, 230, 0.7);
        border: 1px solid var(--saito-border-color);
        border-radius: 3rem;
      }

      .game-loader-backdrop + img + .saito-loader-container{
        width: min(25rem, 90vw);
        height: 20rem;
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        background-color: rgba(230, 230, 230, 0.5);
        border: 1px solid var(--saito-border-color);
        border-radius: 3rem;
        padding-top: 2rem;
      }

      .saito-loader-container h1{
        font-size: min(4.5rem, 12vw);
        font-weight: bold;
        margin-bottom: unset
      }
    </style>

    <script type="text/javascript" src="/saito/saito.js?build=${build_number}" async></script>
  
  </head>
  
  <body>
    ${mod.createSplashScreen()}
    <div id="game-loader-screen">`;

  if (include_loader) {
    let msg = "loading game...";
    let welcome = mod.returnWelcome();
    html += `<div class="game-loader-backdrop" style="background-image: url(/${mod.returnSlug()}/img/arcade/arcade.jpg);"></div>`;

    if (welcome){
      html += welcome;
      msg = "Loading";
    }

    html += `<div id="saito-loader-container" class="saito-loader-container"> 
                <h1>${msg}</h1>
              </div>
            `;
  }

  html += `
      </div>
    </body>
  
  </html>
  
  `;

  return html;
};
