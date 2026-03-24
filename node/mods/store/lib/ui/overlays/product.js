const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const ProductTemplate = require('./product.template');

class ProductOverlay {
	constructor(app, mod, product = {}) {
		this.app = app;
		this.mod = mod;
		this.product = product;
		this.overlay = new SaitoOverlay(app, mod);
	}

	render(product = null) {
		if (product) {
			this.product = product;
		}
		this.overlay.show(ProductTemplate(this.app, this.mod, this.product));
	}
}

module.exports = ProductOverlay;
