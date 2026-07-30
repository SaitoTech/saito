const path = require('path');
const ModTemplate = require('../../lib/templates/modtemplate');

class Websitex extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Websitex';
    this.slug = 'websitex';
    this.description = 'Experimental Saito project website redesign.';
    this.categories = 'Utilities Communications';
    this.class = 'utility';
    this.header = null;

    return this;
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const uri = alternative_slug || `/${encodeURI(this.returnSlug())}`;
    const webdir = path.join(__dirname, 'web');

    expressapp.use(uri, express.static(webdir));
  }
}

module.exports = Websitex;
