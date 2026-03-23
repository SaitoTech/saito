module.exports = (app, mod, build_number) => {
	return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Notifications</title>
      </head>
      <body>
        <div id="saito-container" class="saito-container"></div>
      </body>
    </html>
  `;
};
