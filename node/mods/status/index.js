// mods/status/index.js
module.exports = (app, mod) => {
  // expose public options
  let public_options = Object.assign({}, app.options);
  delete public_options.wallet;
  const opt_str = JSON.stringify(
    public_options,
    (k, v) => (typeof v === 'bigint' ? v.toString() : v)
  );

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    />
    <title>Saito Status</title>
    <link
      rel="stylesheet"
      href="/saito/saito.css?v=${app.build_number}"
    />
    <link
      rel="stylesheet"
      href="/status/style.css?v=${app.build_number}"
    />
  </head>
  <body>
    <div id="status-header"></div>
    <div id="status-container"></div>

    

    <script type="text/javascript">
      window.statusOptions = '${opt_str}';
    </script>

    <script src="/saito/saito.js?build=${app.build_number}"></script>
  </body>
</html>
`;
  return html;
};
