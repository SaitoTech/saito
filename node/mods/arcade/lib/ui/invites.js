const Invite = require('./invite');
const InviteManagerTemplate = require('./invite-container.template');
const JSON = require('json-bigint');
const LoungeOverlay = require('./overlays/lounge');

class InviteManager {
	constructor(app, mod, container = '') {
		this.app = app;
		this.mod = mod;
		this.container = container;
		this.name = 'InviteManager';
		this.type = 'short';

		this.list = 'all';
		this.lists = ['mine', 'open', 'active'];

		if (mod?.sudo) {
			console.info('ARCADE Sudo mode! Should show all games in UI');
			this.lists = ['mine', 'open', 'active', 'private', 'close', 'over'];
		}

		this.game_filter = null;
	}

	render() {
		//
		// replace element or insert into page (deletes invites for a full refresh)
		//
		let target = this.container + ' .arcade-invite';

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
				let listGames = this.mod.returnGamesWithFilter({ status: list }).map((game) => game.tx);

				if (listGames.length > 0 && !this.game_filter) {
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
						for (let i = 0; i < listGames.length; i++) {
							if (listGames[i].msg.options['open-table']) {
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

				for (let i = 0; i < listGames.length && i < 5; i++) {
					if (!this?.game_filter || this.game_filter == listGames[i].msg.game) {
						if (
							list == 'active' &&
							!listGames[i].msg.options['open-table'] &&
							!this.mod.sudo
						) {
							continue;
						}

						let newInvite = new Invite(
							this.app,
							this.mod,
							target,
							this.type,
							listGames[i],
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

		// Sudo: group records where sender is unreachable, label "Offline"
		if (this.mod?.sudo && (this.list === 'all')) {
			let offlineGames = this.mod.returnGamesWithFilter({ is_sender_reachable: false }).map((game) => game.tx);
			if (offlineGames.length > 0 && !this.game_filter) {
				this.app.browser.addElementToSelector(
					`<h5 class="sidebar-header">Offline</h5>`,
					target
				);
			}
			for (let i = 0; i < offlineGames.length && i < 5; i++) {
				if (!this?.game_filter || this.game_filter == offlineGames[i].msg.game) {
					let newInvite = new Invite(
						this.app,
						this.mod,
						target,
						this.type,
						offlineGames[i],
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

		this.attachEvents();
	}

	attachEvents() {}
}

module.exports = InviteManager;
