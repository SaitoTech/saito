const VPTemplate = require('./vp.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class VPOverlay {

	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.visible = false;
		this.overlay = new SaitoOverlay(app, mod, false, true, false);
	}

	hide() {
		this.overlay.hide();
	}

	render(spacekey = '') {

		let vp = this.mod.calculateVictoryPoints();

		this.overlay.show(VPTemplate());

		document.querySelector(".vp-overlay").textContent = JSON.stringify(vp, null, 4);

	}

}

module.exports = VPOverlay;
