const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');
const InitializerTemplate = require('./initializer.template');

/**
 * Game initializer overlay. Follows SaitoOverlay pattern; uses same visual structure as Lounge.
 */
class Initializer {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(this.app, this.mod, false, true, false);

		app.connection.on(
			'arcade-game-ready-render-request',
			(game_details) => {
				let game_mod = app.modules.returnModuleBySlug(game_details?.slug);
				this.render(game_details?.id);

				if (!(game_mod?.maxPlayers == 1 || app.browser.isMobileBrowser())) {
					this.notify(game_details.name);
				}

				this.attachEvents(game_details.slug);
			}
		);

		app.connection.on('arcade-close-game', (game_id) => {
			if (game_id == this?.game_id) {
				this.mod.is_game_initializing = false;
				this.overlay.close();
				if (this.mod.browser_active && this.mod.ui) {
					this.mod.ui.render();
				}
			}
		});
	}

	render(ready = false) {
		let html = InitializerTemplate(ready);
		this.overlay.show(html);
	}

	notify(game_name) {
		this.app.browser.createTabNotification('Game ready!', game_name);
		siteMessage(`${game_name} ready to play!`);
		try {
			let chime = new Audio('/saito/sound/Jinja.mp3');
			chime.play();
		} catch (err) {
			console.error(err);
		}
	}

	attachEvents(slug) {
		setTimeout(() => {
			let btn = document.getElementById('arcade-game-controls-start-game');
			if (btn) {
				btn.onclick = (e) => {
					let am = this.app.modules.returnActiveModule()?.returnName() || 'Arcade';
					this.app.options.homeModule = am;
					this.app.storage.saveOptions();
					this.app.browser.logMatomoEvent(
						'StartGameClick',
						am,
						slug ? slug.slice(0, 1).toUpperCase() + slug.slice(1) : 'Game'
					);
					navigateWindow(`/${slug || 'arcade'}`, 200);
				};
			}
		}, 50);
	}
}

module.exports = Initializer;
