const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Main = require('./lib/ui/main');
const index = require('./index');

class Newsplorer extends ModTemplate {

	constructor(app) {
		super(app);

		this.name = 'Newsplorer';
		this.slug = 'newsplorer';
		this.description = 'Saito Blockchain Explorer';
		this.categories = 'Utilities Information';

		this.main = null;
		this.header = null;
		this.styles = ['/saito/saito.css', `/${this.slug}/style.css`];
	}

	async initialize(app) {
		await super.initialize(app);

		if (this.browser_active) {
			this.main = new Main(this.app, this);
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
		}
	}

	async render() {
		await super.render();

		if (this.main) {
			await this.main.render();
			if (this.header) {
				await this.header.render();
			}
		}
	}

	webServer(app, expressapp, express, alternative_slug = null) {
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const self = this;

		expressapp.use(uri, express.static(webdir));

		expressapp.get(uri, async function (req, res) {
			const html = index(app, self, app.build_number);
			res.setHeader('Content-type', 'text/html');
			res.charset = 'UTF-8';
			return res.send(html);
		});
	}

}

module.exports = Newsplorer;
