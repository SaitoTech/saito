const PayTemplate = require('./pay.template');
const SaitoOverlay = require("./../../../../../lib/saito/ui/saito-overlay/saito-overlay");

class PayOverlay {

    constructor(app, mod){
        this.app = app;
        this.mod = mod;
	this.visible = false;
        this.overlay = new SaitoOverlay(app, mod);
    }
 
    render() {

	this.visible = true;
        this.overlay.show(PayTemplate());

	this.attachEvents();
    }

    attachEvents() {
    }

}

module.exports = PayOverlay;

