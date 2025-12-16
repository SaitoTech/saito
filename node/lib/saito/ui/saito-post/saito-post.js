const SaitoOverlay = require('../saito-overlay/saito-overlay');
const SaitoPostTemplate = require('./saito-post.template');

class SaitoPost {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod);

		app.connection.on('choose-post-location', (text, image, modlist) => {
			this.text = text;
			this.modlist = modlist;
			this.image = image;
			this.render();
		});
	}

	render() {
		this.overlay.show(SaitoPostTemplate());

		this.callbacks = {};
		let index = 0;

		for (let m of this.modlist) {
			let rt = m.respondTo('post-content');
			let id = `selection_${index}`;
			let html = `<div id="${id}" class="saito-modal-menu-option"><i class="${rt.icon}"></i><div>${rt.text}</div></div>`;
			this.app.browser.addElementToSelector(
				html,
				'#saito-post-location-selector .saito-modal-content'
			);
			this.callbacks[id] = rt.callback;
			index++;
		}

		this.attachEvents();
	}

	attachEvents() {
		Array.from(
			document.querySelectorAll('#saito-post-location-selector .saito-modal-menu-option')
		).forEach((el) => {
			el.onclick = (e) => {
				this.overlay.close();
				let id = e.currentTarget.getAttribute('id');
				this.callbacks[id](this.text, this.image);
			};
		});
	}
}

module.exports = SaitoPost;
