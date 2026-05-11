const ScreenRecordWizardTemplate = require("./screenrecord-wizard.template");
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');
// const HelpOverlayTemplate = require('./overlays/limbo-help-overlay');

class ScreenRecordWizard{
	constructor(app, mod, options) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod, false);
		this.options = options;
	}

	render() {

		this.overlay.show(ScreenRecordWizardTemplate(this.app, this.mod, this.options));	

		this.attachEvents();
	}

	attachEvents(){

		Array.from(document.querySelectorAll(".record-mode-option")).forEach(icon => {
			icon.onclick = (e) => {
				this.options.includeCamera = (e.currentTarget.getAttribute("id") === "mode-video");
				this.mod.startRecording(this.options);
				this.overlay.close();
			}
		});

	}


}

module.exports = ScreenRecordWizard;
