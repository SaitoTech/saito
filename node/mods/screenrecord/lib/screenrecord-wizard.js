const ScreenRecordWizardTemplate = require("./screenrecord-wizard.template");
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');
// const HelpOverlayTemplate = require('./overlays/limbo-help-overlay');

class ScreenRecordWizard{
	constructor(app, mod, options) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod, false);
		this.options = options;
		this.countdown_started = false;
	}

	render() {

		this.overlay.show(ScreenRecordWizardTemplate(this.app, this.mod, this.options));	

		this.attachEvents();
	}

	attachEvents(){

		Array.from(document.querySelectorAll(".record-mode-option")).forEach(icon => {
			icon.onclick = async (e) => {
				if (this.countdown_started) {
					return;
				}
				this.countdown_started = true;
				this.options.includeCamera = (e.currentTarget.getAttribute("id") === "mode-video");
				this.overlay.close();

				//
				// Everyone in the call gets the same count-in, not just the recorder
				//
				if (this.options?.members?.length) {
					this.mod.sendCountdownTransaction(this.options.members, 5);
				}

				await this.mod.showCountdown(5);
				await this.mod.startRecording(this.options);
			}
		});

	}


}

module.exports = ScreenRecordWizard;
