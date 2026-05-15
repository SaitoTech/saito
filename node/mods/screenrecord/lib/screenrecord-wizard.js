const ScreenRecordWizardTemplate = require("./screenrecord-wizard.template");
const SaitoOverlay = require('./../../../lib/saito/ui/saito-overlay/saito-overlay');
// const HelpOverlayTemplate = require('./overlays/limbo-help-overlay');

class ScreenRecordWizard{
	constructor(app, mod, options) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod, false);
		this.options = options;
		this.countdown_interval = null;
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
				this.options.includeCamera = (e.currentTarget.getAttribute("id") === "mode-video");
				this.overlay.close();
				await this.startCountdown();
				await this.mod.startRecording(this.options);
			}
		});

	}

	startCountdown() {
		this.countdown_started = true;
		let count = 5;
		let existingCountdown = document.getElementById('screenrecord-countdown-overlay');
		if (existingCountdown) {
			existingCountdown.remove();
		}
		let countdown = document.createElement('div');
		countdown.id = 'screenrecord-countdown-overlay';
		countdown.className = 'screenrecord-countdown-overlay';
		countdown.setAttribute('aria-live', 'assertive');
		countdown.innerHTML = `
			<div class="screenrecord-countdown-label">Recording starts in</div>
			<div class="screenrecord-countdown-number">5</div>
		`;
		document.body.appendChild(countdown);
		let countNumber = countdown.querySelector('.screenrecord-countdown-number');
		let countLabel = countdown.querySelector('.screenrecord-countdown-label');

		if (!countdown || !countNumber) {
			return Promise.resolve();
		}

		return new Promise(resolve => {
			this.countdown_interval = setInterval(() => {
				count--;
				countNumber.textContent = count;

				if (count <= 0) {
					clearInterval(this.countdown_interval);
					this.countdown_interval = null;
					countdown.classList.add('screenrecord-countdown-started');
					if (countLabel) {
						countLabel.textContent = 'Recording started';
					}
					setTimeout(() => {
						countdown.remove();
						resolve();
					}, 500);
				}
			}, 1000);
		});
	}


}

module.exports = ScreenRecordWizard;
