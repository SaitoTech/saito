module.exports = (app, mod, build_number) => {
  return `
  <!DOCTYPE html>
  <html lang=\"en\">
  <head>
    <meta charset=\"utf-8\">
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
    <meta name=\"description\" content=\"${mod.description}\">
    <title>Saito Status</title>
    <link rel=\"stylesheet\" type=\"text/css\" href=\"/saito/css-imports/saito-variables.css\" />
    <link rel=\"stylesheet\" type=\"text/css\" href=\"/${mod.name}/style.css\" />
    <link rel=\"icon\" media=\"(prefers-color-scheme: light)\" href=\"/saito/img/favicon.svg\" type=\"image/svg+xml\" />
    <link rel=\"icon\" media=\"(prefers-color-scheme: dark)\" href=\"/saito/img/favicon-dark.svg\" type=\"image/svg+xml\" />
  </head>
  <body>
    <div id=\"saito-react-app\"></div>
    <script type=\"text/javascript\" src=\"/saito/saito.js\"></script>
  </body>
  </html>
  `;
} 