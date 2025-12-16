const path = require('path');
const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');

class Website extends ModTemplate {
	constructor(app) {
		super(app);

		this.app = app;
		this.name = 'Website';
		this.slug = 'website';
		this.description = 'Module that creates a root website on a Saito node.';
		this.categories = 'Utilities Communications';
		this.class = 'utility';
		this.header = null;
		return this;
	}

	initializeHompage(app) {}

	initializeHTML(app) {
		alert('initializeHTML');
	}
	initialize(app) {}

	webServer(app, expressapp, express, alternative_slug = null) {
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;

		expressapp.use(uri, express.static(webdir));
	}
}
module.exports = Website;
