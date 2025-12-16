module.exports = async (app, mod, build_number) => {
  let html = `
  <!DOCTYPE html>
  <html lang="en">
  
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />

    <meta name="description" content="${app.browser.escapeHTML(mod.description)}" />
    <meta name="keywords" content="${mod.categories}"/>
    <meta name="author" content="Saito"/>
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=yes" />
  
    <meta name="mobile-web-app-capable" content="no" />
    <meta name="apple-mobile-web-app-capable" content="no" />
      
    <link rel="stylesheet" type="text/css" href="/admin/admin.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href='/saito/lib/jsonTree/jsonTree.css'/>
    <title>Saito Dashboard</title>
  
  </head>
  
  <body>
    <h1 id = "page-header">${app.options?.admin?.length ? 'Logging in to Admin Dashboard' : 'Congratulations'}!</h1>

    <div class="node-info">
      <h3>Node Info</h3>
      <div id="node-publickey" data-publickey="${mod.publicKey}">Public Key: ${mod.publicKey}</div>
    </div>

    <div class="dev-welcome">
      <p>If you are reading this, your node is working!</p>
      <p>This webpage is being served by the admin module [mods/admin]. It provides a quick way to configure your server.</p>
      <p>For manual setup instructions, please see our install instructions in the <a target='_blank' href="https://wiki.saito.io">Saito Wiki</a>.</p>
      <p class='more-info'></p>
    </div>


   </body>

   <script type="text/javascript">
    var need_to_set_key = ${!app.options.admin?.length};
    var active_module = '${mod.returnSlug()}';
   </script>
   <script type="text/javascript" src="/saito/saito.js?build=${build_number}"></script>
  </html>`;

  return html;
};
