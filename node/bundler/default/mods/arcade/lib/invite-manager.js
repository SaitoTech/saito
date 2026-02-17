const Invite = require('./invite');
const InviteManagerTemplate = require('./invite-manager.template');
const JSON = require('json-bigint');
const JoinGameOverlay = require('./overlays/join-game');
const GameSlider = require('./game-slider');

class InviteManager {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.name = 'InviteManager';
		this.type = 'short';

		this.slider = new GameSlider(this.app, this.mod, '.invite-manager');

		// For filtering which games get displayed
		// We may want to only display one type of game invite, so overwrite this before render()
		this.list = 'all';
		this.lists = ['mine', 'open', 'active'];

		if (mod?.sudo) {
			console.info('ARCADE Sudo mode! Should show all games in UI');
			this.lists = ['mine', 'open', 'active', 'private', 'close', 'over', 'offline'];
		}

		this.game_filter = null;

		this.show_carousel = true;

		//
		// handle requests to re-render invite manager
		//
		app.connection.on('arcade-invite-manager-render-request', () => {
			if (this.mod.debug) {
				console.debug('RERENDER ARCADE INVITES: ', this.mod.games);
			}
			if (!this.mod.is_game_initializing) {
				this.mod.purgeOldGames();
				this.render();
			}
		});

		app.connection.on('finished-loading-leagues', () => {
			if (!this.mod.is_game_initializing) {
				this.mod.purgeOldGames();
				this.render();
			}
		});
	}

	render() {
		//
		// replace element or insert into page (deletes invites for a full refresh)
		//
		let target = this.container + ' .invite-manager';

		if (document.querySelector(target)) {
			this.app.browser.replaceElementBySelector(InviteManagerTemplate(this.app, this.mod), target);
		} else {
			this.app.browser.addElementToSelector(
				InviteManagerTemplate(this.app, this.mod),
				this.container
			);
		}

		let rendered_content = false;

		for (let list of this.lists) {
			if (this.list === 'all' || this.list === list) {
				if (!this.mod.games[list]) {
					this.mod.games[list] = [];
				}

				if (this.mod.games[list].length > 0 && !this.game_filter) {
					if (list === 'mine') {
						this.app.browser.addElementToSelector(
							`<h5 class="sidebar-header">My Games</h5>`,
							target
						);
					} else if (list == 'open') {
						this.app.browser.addElementToSelector(
							`<h5 class="sidebar-header">Open Invites</h5>`,
							target
						);
					} else if (list == 'active') {
						let valid_open_games = false;
						for (let i = 0; i < this.mod.games[list].length; i++) {
							if (this.mod.games[list][i].msg.options['open-table']) {
								valid_open_games = true;
							}
						}
						if (valid_open_games) {
							this.app.browser.addElementToSelector(
								`<h5 class="sidebar-header">Active Matches</h5>`,
								target
							);
						}
					} else if (list == 'over') {
						this.app.browser.addElementToSelector(
							`<h5 class="sidebar-header">Recent Matches</h5>`,
							target
						);
					} else {
						this.app.browser.addElementToSelector(
							`<h5 class="sidebar-header">${
								list.charAt(0).toUpperCase() + list.slice(1)
							} Games</h5>`,
							target
						);
					}
				}

				for (let i = 0; i < this.mod.games[list].length && i < 5; i++) {
					if (!this?.game_filter || this.game_filter == this.mod.games[list][i].msg.game) {
						if (
							list == 'active' &&
							!this.mod.games[list][i].msg.options['open-table'] &&
							!this.mod.sudo
						) {
							continue;
						}

						let newInvite = new Invite(
							this.app,
							this.mod,
							target,
							this.type,
							this.mod.games[list][i],
							this.mod.publicKey
						);

						if (this.app.modules.returnModuleByName(newInvite.invite_data.game_name)) {
							if (newInvite.invite_data.league) {
								if (!this.mod.leagueCallback?.testMembership(newInvite.invite_data.league)) {
									continue;
								}
							}
							newInvite.render();
							rendered_content = true;
						}
					}
				}
			}
		}

		if (!rendered_content && !this.game_filter && this.show_carousel) {
			this.slider.render();
		}

		this.attachEvents();
	}

	attachEvents() {}
}

module.exports = InviteManager;
