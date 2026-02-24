module.exports = async (app, mod, build_number, server_publickey="") => {
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
      
    <link rel="stylesheet" type="text/css" href="/admin/style.css?v=${build_number}" />
    <link rel="stylesheet" type="text/css" href="/saito/lib/font-awesome-6/css/fontawesome.min.css" />
    <link rel="stylesheet" type="text/css" href="/saito/lib/font-awesome-6/css/all.css" />
    <link rel="stylesheet" type="text/css" href='/saito/lib/jsonTree/jsonTree.css'/>
    <title>Saito Dashboard</title>
  
  </head>
  
  <body>

    <div class="saito-container" id="saito-container">
    </div>

  </body>

  <script type="text/javascript">
    var server_publickey = "${server_publickey}";
    var need_to_set_key = ${!app.options.admin?.length};
    var active_module = '${mod.returnSlug()}';
  </script>
  <script type="text/javascript" src="/saito/saito.js?build=${build_number}"></script>
  </html>`;

  return html;
};
