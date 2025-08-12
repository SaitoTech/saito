const JSON = require('json-bigint');
const AssetStoreMainTemplate = require('./main.template');

class AssetStoreMain {

	constructor(app, mod, container = 'body') {

		this.app = app;
		this.mod = mod;
		this.container = container;

	}

	async render() {

    		if (!document.querySelector('.saito-container')) {
      		  this.app.browser.addElementToDom(AssetStoreMainTemplate(this.app, this.mod));
    		}

		this.attachEvents();
	}

	attachEvents() {
	}

}

module.exports = AssetStoreMain;
