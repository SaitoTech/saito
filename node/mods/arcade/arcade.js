const PeerService = require('saito-js/lib/peer_service').default;
const Transaction = require('../../lib/saito/transaction').default;
const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const ArcadeMain = require('./lib/ui/main');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const InviteManager = require('./lib/ui/invites');
const GameWizard = require('./lib/ui/overlays/wizard');
const GameInvitationLink = require('./../../lib/saito/ui/modals/saito-link/saito-link');
const Invite = require('./lib/ui/invite');
const LoungeOverlay = require('./lib/ui/overlays/lounge');
const ArcadeInitializer = require('./lib/ui/overlays/initializer');

const arcadeHome = require('./index');

class Arcade extends ModTemplate {
	constructor(app) {
		super(app);


		//
		// module basics
		//
		this.name = 'Arcade';
		this.slug = 'arcade';
		this.sudo = false;
		this.description = 'Interface for creating and joining games coded for the Saito Open Source Game Engine.';
		this.categories = 'Games Entertainment Appspace';
		this.icon = 'fas fa-gamepad';
		this.styles = ['/arcade/style.css'];
		this.affix_callbacks_to = [];


		//
		// modules and games
		//
		this.mods = [];
		this.games = {};

		this.is_game_initializing = false;


		////////////////////////////////////////////////////
		///////////////////  UI STATE  /////////////////////
		////////////////////////////////////////////////////

		//
		// UI Components
		//
		this.ui = null;
		this.header = null;
		this.lounge_overlay = null;
		this.initializer_overlay = null;
		this.wizard_overlay = null;
		this.share_overlay = null;

		//
		// Still using deprecated peerhandshakecomplete rather than peerservice
		//
		this.services = [this.app.network.createPeerService(null, 'arcade', '', 'saito')];

		this.possibleHome = 1;

		this.social = {
			twitter: '@SaitoOfficial',
			title: '🟥 Saito Arcade',
			url: 'https://saito.io/arcade/',
			description: 'Peer to peer gaming on the blockchain',
			image: 'https://saito.tech/wp-content/uploads/2023/11/arcade-300x300.png'
		};

		app.connection.on('arcade-issue-challenge', async ({ game, players, options }) => {
			let tx;

			if (this.challenge_tx) {
				tx = await this.createJoinTransaction(this.challenge_tx);
			} else {
				tx = await this.createChallengeTransaction(game, players, options);
			}

			if (tx) {
				app.connection.emit('relay-send-message', {
					recipient: players,
					request: 'arcade spv update',
					data: tx.toJson()
				});
			}
		});

		app.connection.on('arcade-notify-player-turn', (game_id, target, status) => {
			for (let game of app.options.games) {
				if (game.id == game_id) {
					//let prev_target = game.target;

					game.status = status;
					game.target = target;

					// save with turn updated, so reload works
					app.storage.saveOptions();

					siteMessage(`It is now your turn in ${game.module}`, 5000);
					if (this.browser_active && this.ui) {
						this.ui.renderInvites();
					}
				}
			}
		});

		app.connection.on('arcade-gametable-addplayer', (game_id) => {
			console.info('EVENT: arcade-gametable-addplayer');
			let game_tx = this.returnGameTransaction(game_id);
			if (game_tx) {
				this.sendJoinTransaction({ tx: game_tx, game_name: 'open_table' });
			}
		});

		app.connection.on('arcade-gametable-removeplayer', (game_id, player_stats) => {
			console.info('EVENT: arcade-gametable-removeplayer');
			let game_tx = this.returnGameTransaction(game_id);
			if (game_tx) {
				this.sendLeaveTransaction(game_tx, player_stats);
			}
		});

		app.connection.on('arcade-continue-game-from-options', async (game_mod) => {
			let id = game_mod.game?.id;
			if (!id) {
				return;
			}

			console.info('arcade-continue-game-from-options');

			let game_tx = this.returnGameTransaction(id);

			if (!game_tx) {
				console.info('ARCADE: Creating fresh transaction');
				game_tx = await this.createPseudoTransaction(game_mod.game);
				this.addGame(game_tx, 'closed');
			} else {
				delete game_tx.msg.time_finished;
				delete game_tx.msg.method;
				delete game_tx.msg.winner;
				game_tx.msg.request = 'paused';
			}

			console.info(
				'ARCADE: ',
				JSON.parse(JSON.stringify(game_tx)),
				JSON.parse(JSON.stringify(game_mod.game))
			);

			let newInvite = new Invite(app, this, null, 'short', game_tx, this.publicKey);
			this.render('lounge_overlay', { invite_data: newInvite.invite_data });
		});

	}

	showInitializerOverlay(game_id) {
		this.render('initializer_overlay', { game_id });
	}

	//////////////////////////////
	// INITIALIZATION FUNCTIONS //
	//////////////////////////////
	//
	// runs when the module initializes, note that at this point the network
	// may not be up. use onPeerHandshakeCompete() to make requests over the
	// network and process the results.
	//
	async initialize(app) {
		await super.initialize(app);

		//
		// compile list of arcade games
		//
		app.modules.returnModulesRespondingTo('arcade-games').forEach((game_mod) => {
			this.mods.push(game_mod);
			//
			// and listen to their transactions
			//
			this.affix_callbacks_to.push(game_mod.name);
		});

		if (!app.options.arcade) {
			app.options.arcade = {};
		}

		//
		// Maybe good, maybe not... Only sorts on fresh load...
		//
		this.mods = this.mods.sort((a, b) => {
			//Default sorting 1, 0, -1
			let b_count = b.sort_priority;
			let a_count = a.sort_priority;

			if (app.options.arcade?.last_game == b.name) {
				return 1;
			}

			//Add user behavior metrics
			if (app.options.arcade[b.name]) {
				b_count += 2 * app.options.arcade[b.name];
			}

			if (app.options.arcade[a.name]) {
				a_count += 2 * app.options.arcade[a.name];
			}

			return b_count - a_count;
		});

		//
		// If we have a browser (are a user)
		// initialize some UI components and query the list of games to display
		//
		if (this.app.BROWSER == 1) {
			if (this.browser_active && this.app.browser.returnURLParameter('moderator')) {
				this.sudo = true;
			}

			//
			// UI instances (do not render here)
			//
			this.ui = new ArcadeMain(this.app, this);
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
			this.header.header_class = 'arcade';
			this.addComponent(this.header);
			this.addComponent(this.ui);

			this.lounge_overlay = new LoungeOverlay(this.app, this, null);
			this.initializer_overlay = new ArcadeInitializer(this.app, this);
			this.wizard_overlay = new GameWizard(this.app, this, null, {});

			this.renderIntos = this.renderIntos || {};

			//
			// my games stored in local wallet
			//
			if (this.app.options.games) {
				this.purge();

				for (let game of this.app.options.games) {
					if (game.players.includes(this.publicKey) || game.accepted.includes(this.publicKey)) {
						if (game.over) {
							if (game.last_block > 0) {
								console.debug(`ARCADE: don't add finished game from options`);
								return;
							}
						}

						//
						// We create a dummy tx from the saved game state so that the arcade can render the
						// active game like a new open invite
						//
						let game_tx = await this.createPseudoTransaction(game);

						//
						// and add to list of my games
						//
						if (!game.over) {
							this.addGame(game_tx, 'active');
						} else {
							this.addGame(game_tx, 'over');
						}
					}
				}
			}

			//Check for server delivered data load
			if (window?.game) {
				let game_tx = new Transaction();
				game_tx.deserialize_from_web(app, window.game);
				this.addGame(game_tx);
			}

			if (this.browser_active && this.ui) {
				this.ui.renderInvites();
			}

			setInterval(() => {
				this.purge();
				if (this.browser_active && this.ui) {
					this.ui.renderInvites();
				}
			}, 90000);
		}

		try {
			this.leagueCallback = this.app.modules.returnFirstRespondTo('league-membership');
		} catch (err) {
			this.leagueCallback = {};
		}
	}

	async createPseudoTransaction(game) {
		let game_tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

		if (game.accepted) {
			game.accepted.forEach((player) => {
				game_tx.addTo(player);
				game_tx.addFrom(player);
			});
		} else {
			game_tx.addFrom(this.publicKey);
			game_tx.addTo(this.publicKey);
		}

		let msg = {
			//ts
			module: 'Arcade',
			request: 'loaded', //will be overwritten as "active" when added
			game: game.module,
			options: game.options,
			players_needed: game.players_needed,
			players: game.accepted,
			players_sigs: [], //Only used to verify cryptology when initializing the game
			originator: game.originator,
			//winner: game.winner,
			step: game?.step?.game,
			timestamp: game?.timestamp
		};

		game_tx.signature = game.id;
		game_tx.msg = msg;

		return game_tx;
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (!app.BROWSER) {
			let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
			newtx.msg = {
				module: 'Arcade',
				request: 'arcade update peer status',
				data: {
					publickey: peer.publicKey,
					status: 'online'
				}
			};
			await newtx.sign();
			this.notifyPeers(newtx);

			for (let id in this.games) {
				let record = this.games[id];
				if (record.tx.from[0].publicKey == peer.publicKey) {
					record.is_sender_reachable = true;
				}
			}

			return;
		}

		let arcade_self = this;

		if (service.service == 'arcade') {
			this.app.network.sendRequestAsTransaction('arcade invite list', {}, (txs) => {
				for (let serial_tx of txs) {
					let game_tx = new Transaction();
					game_tx.deserialize_from_web(app, serial_tx);

					let status = game_tx.msg.request;
					let game_added = arcade_self.addGame(game_tx);

					if (arcade_self?.debug && arcade_self.browser_active) {
						console.debug('Available arcade game:', status, game_added, game_tx);
					}

					//Game is marked as "active" but we didn't already add it from our app.options file...
					if (status == 'active' && game_added && arcade_self.isMyGame(game_tx)) {
						game_tx.msg.game_id = game_tx.signature;
						arcade_self.receiveAcceptTransaction(game_tx);
					}
				}

				//
				// For processing direct link to game invite
				//
				if (arcade_self.app.browser.returnURLParameter('game_id')) {
					this.loadGameInviteById(
						arcade_self.app.browser.returnURLParameter('game_id'),
						arcade_self.app.browser.returnURLParameter('game'),
						arcade_self.app.browser.returnURLParameter('invite')
					);

					// Overwrite link-url with baseline url
					window.history.replaceState('', '', `/arcade/`);
				}

				if (this.browser_active && this.ui) {
					this.ui.renderInvites();
				}
				app.connection.emit('arcade-data-loaded');
			});
		}

		if (service.service === 'archive') {
			for (let game of this.app.options.games) {
				if (game?.over) {
					continue;
				}

				let query = game.module + '_' + game.id;
				let game_mod = this.app.modules.returnModule(game.module);

				if (!game_mod) {
					continue;
				}

				this.app.storage.loadTransactions(
					{
						field1: query
					},
					async (txs) => {
						for (let i = txs.length - 1; i >= 0; i--) {
							// arcade
							await this.onConfirmation(-1, txs[i], 0);

							// game mod
							await game_mod.onConfirmation(-1, txs[i], 0);
						}
					},
					peer
				);
			}
		}
	}

	loadGameInviteById(game_id_short, gameName, is_invite = false) {
		let record = this.filterGames(
			(r) => this.app.crypto.hash(r.tx.signature).slice(-6) == game_id_short
		)[0];
		let game = record ? record.tx : null;

		if (!game || game.msg.request == 'cancel' || game.msg.request == 'closed') {
			console.warn('Load Game by ID failed...', game?.msg);
			if (is_invite) {
				salert('Sorry, the game is no longer available');
				if (gameName) {
					let gm = this.app.modules.returnModule(gameName);
					this.app.connection.emit('arcade-launch-game-wizard', { game: gm.returnName() });
				}
			} else {
				this.app.connection.emit('league-overlay-render-request', '', gameName, 'games');
			}
			return;
		}

		if (this.isAvailableGame(game)) {
			//Mark myself as an invited guest
			game.msg.options.desired_opponent_publickey = this.publicKey;

			//Then we have to remove and readd the game so it goes under "mine"
			this.removeGame(game.signature);
			this.addGame(game);
		}

		this.app.browser.logMatomoEvent('GameInvite', 'FollowLink', game.game);

		let invite = new Invite(this.app, this, null, null, game, this.publicKey);
		this.render('lounge_overlay', { invite_data: invite.invite_data });
	}

	////////////
	// RENDER //
	////////////
	async render(mode = null, data = {}) {

		//
		// add chat manager
		//
		if (!this.chat_components_added) {
			for (const mod of this.app.modules.returnModulesRespondingTo('chat-manager')) {
				let cm = mod.respondTo('chat-manager');
				cm.container = '.arcade-sidebar';
				cm.render_manager_to_screen = 1;
				this.addComponent(cm);
			}
			this.chat_components_added = true;
		}

		//
		// 
		//
		await super.render();

		if (mode === 'lounge_overlay') {
			if (this.lounge_overlay && data.invite_data != null) {
				this.lounge_overlay.invite = data.invite_data;
				this.lounge_overlay.render();
			}
			return;
		}

		if (mode === 'initializer_overlay') {
			if (this.initializer_overlay) {
				this.initializer_overlay.game_id = data.game_id;
				this.is_game_initializing = true;
				this.initializer_overlay.render();
			}
			return;
		}

	}

	//
	// let other modules know if we can render into any components
	//
	canRenderInto(qs) {
		if (qs === '.redsquare-sidebar') {
			return true;
		}
		if (qs === '.arcade-sidebar') {
			return true;
		}

		return false;
	}

	//
	// render components into other modules on-request
	//
	async renderInto(qs) {
		if (qs == '.arcade-sidebar') {
			if (!this.ui) return;
			if (!this.renderIntos[qs]) {
				this.styles = ['/arcade/style.css'];
				this.renderIntos[qs] = [];
				this.renderIntos[qs].push(this.ui.sidebar);
				this.attachStyleSheets();
			}
		}
		if (qs == '.redsquare-sidebar') {
			if (!this.renderIntos[qs]) {
				this.styles = ['/arcade/style.css'];
				this.renderIntos[qs] = [];
				this.invite_manager = new InviteManager(this.app, this, qs);
				this.invite_manager.type = 'short';
				this.renderIntos[qs].push(this.invite_manager);
				this.attachStyleSheets();
			}
		}

		if (this.renderIntos[qs] != null && this.renderIntos[qs].length > 0) {
			for (const comp of this.renderIntos[qs]) {
				await comp.render();
			}
		}
	}

	//
	// flexible inter-module-communications
	//

	respondTo(type = '', obj) {
		// Phase 1: no direct UI instantiation, no .render() calls; return references only

		if (type === 'saito-header') {
			let x = [];
			if (!this.browser_active) {
				this.attachStyleSheets();
				x.push({
					text: 'Arcade',
					icon: this.icon || 'fas fa-gamepad',
					rank: 10,
					type: 'quicklaunch',
					callback: function (app, id) {
            					navigateWindow(`/arcade`);
					},
					navigation: '/arcade'
				});
			}
			return x;
		}

		if (type === 'saito-link') {
			const urlParams = new URL(obj?.link).searchParams;
			if (urlParams.has('game_id') && urlParams.has('game')) {
				return {
					processLink: (link) => {
						this.loadGameInviteById(
							urlParams.get('game_id'),
							urlParams.get('game'),
							urlParams.has('invite')
						);
					}
				};
			}
		}

		if (type === 'saito-filter-link') {
			if (obj.slug == this.returnSlug()) {
				if (!obj.url.includes('invite')) {
					return {
						info: [],
						no_photo: true
					};
				} else {
					return {
						info: ['title']
					};
				}
			}
		}

		return super.respondTo(type, obj);
	}

	////////////////////////////////////////////////////
	// NETWORK FUNCTIONS -- sending and receiving TXS //
	////////////////////////////////////////////////////
	//
	////////////////////////////////////////////////////
	// ON CONFIRMATION === process on-chain transactions
	////////////////////////////////////////////////////

	async onConfirmation(blk, tx, conf) {

		let txmsg = tx.returnMessage();
		let arcade_self = this.app.modules.returnModule('Arcade');

		if (Number(conf) == 0) {
			try {
				if (txmsg.module === 'Arcade') {
					if (this.hasSeenTransaction(tx, Number(blk.id))) {
						return;
					}

					//
					// public & private invites processed the same way
					//
					if (txmsg.request === 'open' || txmsg.request === 'private') {
						await arcade_self.receiveOpenTransaction(tx, blk);
					}

					//
					// Add a player to the game invite
					//
					if (txmsg.request == 'join') {
						await arcade_self.receiveJoinTransaction(tx);
					}

					// Remove player from ongoing game
					if (txmsg.request == 'leave') {
						await arcade_self.receiveLeaveTransaction(tx);
					}

					//
					// cancel a join transaction / Remove a player from the game invite
					//
					if (txmsg.request == 'cancel') {
						await arcade_self.receiveCancelTransaction(tx);
					}

					//
					// kick off game initialization
					//
					if (txmsg.request === 'accept') {
						await arcade_self.receiveAcceptTransaction(tx);
					}
				} else {
					if (txmsg.request === 'stopgame') {
						await arcade_self.receiveCloseTransaction(tx);
					}

					if (txmsg.request === 'gameover') {
						await arcade_self.receiveGameoverTransaction(tx);
					}

					if (txmsg.request === 'game') {
						await arcade_self.receiveGameStepTransaction(tx);
					}

					//
					// Archive game overs for async to work
					//
					if (!this.app.BROWSER) {
						let step = txmsg?.step?.game || txmsg.step || null;
						if (step) {
							step = String(step).padStart(5, '0');
						}
						await this.app.storage.saveTransaction(
							tx,
							{ field4: txmsg.game_id, field5: step, field5_sort: 1 },
							'localhost'
						);
					}
				}

				//
				// only servers notify lite-clients
				// Added this so cross-network onChain messages can duplicate quickly
				//
				if (this.app.BROWSER == 0 && this.app.SPVMODE == 0) {
					this.notifyPeers(tx);
				}
			} catch (err) {
				console.error('ERROR in arcade onconfirmation block: ', err);
			}
		}
	}

	/////////////////////////////
	// HANDLE PEER TRANSACTION //
	/////////////////////////////
	//
	// handles off-chain transactions, packaged as data by Relay module
	//
	async handlePeerTransaction(app, newtx = null, peer, mycallback = null) {
		if (newtx == null) {
			return 0;
		}
		let message = newtx.returnMessage();

		if (message.request === 'arcade invite list') {
			// Process stuff on server side

			this.purge();

			let txs = [];
			let peers = await app.network.getPeers();

			for (let id in this.games) {
				let record = this.games[id];
				if (record.is_sender_reachable !== true) continue;
				let g = record.tx;
				txs.push(g.serialize_to_web(this.app));
			}

			if (mycallback) {
				mycallback(txs);
				return 1;
			}
		}

		if (message.request === 'arcade clear invite') {
			this.removeGame(message.data.game_id);
			return 1;
		}

		//
		// this code doubles onConfirmation
		//
		if (message?.data && message?.request === 'arcade spv update') {
			let tx = new Transaction(undefined, message.data);

			this.hasSeenTransaction(tx);

			let txmsg = tx.returnMessage();

			if (txmsg.module === 'Arcade') {
				//
				// public & private invites processed the same way
				//
				if (txmsg.request === 'open' || txmsg.request === 'private') {
					await this.receiveOpenTransaction(tx);
				}

				//
				// Add a player to the game invite
				//
				if (txmsg.request == 'join') {
					await this.receiveJoinTransaction(tx);
				}

				// Remove player from ongoing game
				if (txmsg.request == 'leave') {
					await this.receiveLeaveTransaction(tx);
				}

				//
				// cancel a join transaction / Remove a player from the game invite
				//
				if (txmsg.request == 'cancel') {
					await this.receiveCancelTransaction(tx);
				}

				//
				// kick off game initialization
				//
				if (txmsg.request === 'accept') {
					await this.receiveAcceptTransaction(tx);
				}

				//TODO - reimplement / check
				// This was an idea to completely off-chain send a player a direct/play now game invite
				// Which will pop up a yes/no demand for immediate response

				if (txmsg.request == 'challenge') {
					this.receiveChallengeTransaction(tx);
				}

				if (txmsg.request == 'sorry') {
					//Trigger UI update in game
					app.connection.emit('arcade-reject-challenge', txmsg.game_id);
				}

				if (txmsg.request === 'arcade update peer status') {
					await this.receivePeerStatusUpdateTransaction(tx);
				}
			} else {
				if (txmsg.request === 'stopgame') {
					await this.receiveCloseTransaction(tx);
				}
				if (txmsg.request === 'gameover') {
					await this.receiveGameoverTransaction(tx);
				}
				if (this.app.BROWSER) {
					if (txmsg.request === 'game') {
						await this.receiveGameStepTransaction(tx);
					}
				}
			}

			//
			// only servers notify lite-clients
			//
			if (app.BROWSER == 0 && app.SPVMODE == 0) {
				this.notifyPeers(tx);
			}

			return 1;
		}

		return super.handlePeerTransaction(app, newtx, peer, mycallback);
	}

	async onConnectionUnstable(app, publicKey) {
		if (this.app.BROWSER == 1) {
			return;
		}

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.msg = {
			module: 'Arcade',
			request: 'arcade update peer status',
			data: {
				publickey: publicKey,
				status: 'offline'
			}
		};
		await newtx.sign();
		this.notifyPeers(newtx);

		for (let id in this.games) {
			let record = this.games[id];
			if (record.tx.from[0].publicKey === publicKey) {
				record.is_sender_reachable = false;
			}
		}
	}

	//
	// send TX to our SPV peers
	//
	async notifyPeers(tx) {
		if (this.app.BROWSER == 1) {
			return;
		}
		let peers = await this.app.network.getPeers();

		for (let peer of peers) {
			if (peer.synctype == 'lite' && peer?.status !== 'disconnected') {
				//
				// fwd tx to peer
				//
				let message = {};
				message.request = 'arcade spv update';
				message.data = tx.toJson();

				this.app.network.sendRequestAsTransaction(
					message.request,
					message.data,
					null,
					peer.peerIndex
				);
			}
		}
	}

	///////////////////////
	// GAME TRANSACTIONS //
	///////////////////////
	//
	// open - creating games
	// join - adds player, but does not initialize
	// accept - the final player to join, triggers initialization
	//
	///////////////
	// OPEN GAME //
	///////////////
	//
	// an OPEN transaction is the first step in creating a game. It describes the
	// conditions of the game and triggers browsers to add it to their list of
	// available games.
	//
	// servers can also index the transaction to notify others that a game is
	// available if asked.
	//
	async createOpenTransaction(gamedata) {
		let sendto = this.publicKey;
		let moduletype = 'Arcade';

		let { timestamp, name, options, players_needed, invitation_type } = gamedata;

		let accept_sig = await this.app.crypto.signMessage(
			`invite_game_${timestamp}`,
			await this.app.wallet.getPrivateKey()
		);

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.addTo(this.publicKey);
		if (options?.desired_opponent_publickey) {
			newtx.addTo(options.desired_opponent_publickey);
		}

		newtx.msg = {
			timestamp: timestamp,
			module: moduletype,
			request: invitation_type,
			game: name,
			options: options,
			players_needed: parseInt(players_needed),
			players: [this.publicKey],
			players_sigs: [accept_sig],
			originator: this.publicKey
		};

		await newtx.sign();

		return newtx;
	}

	async receiveOpenTransaction(tx, blk = null) {
		let txmsg = tx.returnMessage();

		// add to games list == open or private
		this.addGame(tx);
		if (this.browser_active && this.ui) {
			this.ui.renderInvites();
		}

		if (tx.isFrom(this.publicKey)) {
			clearTimeout(this.game_timeout);
			if (this.app.browser.isMobileBrowser(navigator.userAgent) && !this.browser_active) {
				siteMessage('Game invite created', 1000);
			} else {
				if (txmsg.request == 'private') {
					this.showShareLink(tx.signature);
				}
			}
			return;
		}

		if (txmsg?.options?.desired_opponent_publickey == this.publicKey) {
			siteMessage(`You were invited to play ${txmsg.game}`, 5000);
		}
	}

	////////////
	// Cancel //
	////////////
	async createCancelTransaction(orig_tx) {
		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();

		for (let player of orig_tx.msg.players) {
			newtx.addTo(player);
		}
		newtx.addTo(this.publicKey);

		let msg = {
			request: 'cancel',
			module: 'Arcade',
			game_id: orig_tx.signature
		};
		newtx.msg = msg;
		await newtx.sign();

		return newtx;
	}

	async receiveCancelTransaction(tx) {
		let txmsg = tx.returnMessage();
		let game = this.returnGameTransaction(txmsg.game_id);

		if (!game || !game.msg) {
			return;
		}

		if (game.msg.players.includes(tx.from[0].publicKey)) {
			if (tx.from[0].publicKey == game.msg.originator) {
				this.changeGameStatus(txmsg.game_id, 'closed');
			} else {
				let p_index = game.msg.players.indexOf(tx.from[0].publicKey);
				game.msg.players.splice(p_index, 1);
				//Make sure player_sigs array exists and add invite_sig
				if (game.msg.players_sigs && game.msg.players_sigs.length > p_index) {
					game.msg.players_sigs.splice(p_index, 1);
				}
			}
		} else if (
			game.msg.options?.desired_opponent_publickey &&
			tx.isFrom(game.msg.options.desired_opponent_publickey)
		) {
			if (this.publicKey == game.msg.originator) {
				siteMessage('Your game invite was declined', 5000);
			}
			this.changeGameStatus(txmsg.game_id, 'closed');
		}

		this.app.connection.emit('arcade-close-game', txmsg.game_id);
		if (this.browser_active && this.ui) {
			this.ui.renderInvites();
		}
	}

	async sendCancelTransaction(game_id) {
		let game = this.returnGameTransaction(game_id);

		if (!game || !game.msg) {
			return;
		}

		let close_tx = await this.createCancelTransaction(game);
		this.app.network.propagateTransaction(close_tx);

		this.app.connection.emit('relay-send-message', {
			recipient: game.msg.players,
			request: 'arcade spv update',
			data: close_tx.toJson()
		});

		this.app.connection.emit('relay-send-message', {
			recipient: 'PEERS',
			request: 'arcade spv update',
			data: close_tx.toJson()
		});
	}

	changeGameStatus(game_id, newStatus) {
		let game = this.returnGameTransaction(game_id);

		//Move game to different list
		if (game) {
			if (this.sudo) {
				console.debug(
					`ARCADE: Change game (${game_id.substring(0, 10)}...) status from ${game.msg.request} to ${newStatus}`
				);
			}

			if (!this?.sudo) {
				if (game?.msg?.request == 'over' || game?.msg?.request == 'closed') {
					return;
				}
			}

			this.removeGame(game_id);
			this.addGame(game, newStatus);
		}

		if (this.browser_active && this.ui) {
			this.ui.renderInvites();
		}
	}

	//////////////
	// GAMEOVER //
	//////////////

	async receiveGameoverTransaction(tx) {
		let txmsg = tx.returnMessage();

		let game = this.returnGameTransaction(txmsg.game_id);

		//In case we arrive at gameover without close game
		this.app.connection.emit('arcade-close-game', txmsg.game_id);
		this.changeGameStatus(txmsg.game_id, 'over');

		let winner = txmsg.winner || null;

		if (game?.msg) {
			//Store the results locally
			game.msg.winner = winner;
			game.msg.method = txmsg.reason;
			game.msg.time_finished = txmsg.timestamp;
		} else {
			console.warn("Game not found, arcade can't process gameover tx");
		}
	}

	async receiveCloseTransaction(tx) {
		let txmsg = tx.returnMessage();

		// Mark game as closed, unless it is a player leaving an open table...
		if (txmsg.reason !== 'withdraw') {
			this.app.connection.emit('arcade-close-game', txmsg.game_id);
			this.changeGameStatus(txmsg.game_id, 'closed');
		}
	}

	async receiveGameStepTransaction(tx) {
		let txmsg = tx.returnMessage();
		let game = this.returnGameTransaction(txmsg.game_id);
		if (game?.msg) {
			game.msg.step = txmsg.step.game;
			game.msg.timestamp = txmsg.step.timestamp;
		}
	}

	////////////
	// Invite // TODO -- confirm we still use these, instead of challenge
	////////////
	//
	// unsure
	//
	async createInviteTransaction(orig_tx) {
		let txmsg = orig_tx.returnMessage();

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		newtx.addTo(orig_tx.from[0].publicKey);
		newtx.addTo(this.publicKey);

		newtx.msg.timestamp = new Date().getTime();
		newtx.msg.module = txmsg.game;
		newtx.msg.request = 'invite';
		newtx.msg.game_id = orig_tx.signature;
		newtx.msg.players_needed = parseInt(txmsg.players_needed);
		newtx.msg.options = txmsg.options;
		newtx.msg.accept_sig = '';
		if (orig_tx.msg.accept_sig != '') {
			newtx.msg.accept_sig = orig_tx.msg.accept_sig;
		}
		if (orig_tx.msg.timestamp != '') {
			newtx.msg.timestamp = orig_tx.msg.timestamp;
		}
		newtx.msg.invite_sig = await this.app.crypto.signMessage(
			'invite_game_' + newtx.msg.timestamp,
			await this.app.wallet.getPrivateKey()
		);
		await newtx.sign();

		return newtx;
	}

	///////////////
	// JOIN GAME //
	///////////////
	//
	// join is the act of adding yourself to a game that does not have enough
	// players. technically, you're providing a signature that -- when returned
	// as part of a valid game, will trigger your browser to start initializing
	// the game.
	//
	async createJoinTransaction(orig_tx, option_update = null) {
		if (!orig_tx || !orig_tx.signature) {
			console.error('ARCADE: Invalid Game Invite TX, cannot Join');
			return;
		}

		let txmsg = orig_tx.returnMessage();

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		for (let player of txmsg.players) {
			newtx.addTo(player);
		}
		newtx.addTo(this.publicKey);

		newtx.msg = JSON.parse(JSON.stringify(txmsg));
		newtx.msg.module = 'Arcade';
		newtx.msg.request = 'join';
		newtx.msg.game_id = orig_tx.signature;
		if (option_update) {
			newtx.msg.options = orig_tx.msg.options[option_update];
			newtx.msg.update_options = option_update;
		}

		newtx.msg.invite_sig = await this.app.crypto.signMessage(
			'invite_game_' + orig_tx.msg.timestamp,
			await this.app.wallet.getPrivateKey()
		);

		await newtx.sign();

		return newtx;
	}

	async sendJoinTransaction(invite, update_options = '') {
		//
		// Create Transaction
		//
		let newtx = await this.createJoinTransaction(invite.tx, update_options);

		//
		// send it on-chain and off-chain
		//
		this.app.network.propagateTransaction(newtx);

		this.app.connection.emit('relay-send-message', {
			recipient: 'PEERS',
			request: 'arcade spv update',
			data: newtx.toJson()
		});

		this.app.browser.logMatomoEvent('GameInvite', 'JoinGame', invite.game_name);
		if (this.browser_active && this.ui) {
			this.ui.renderInvites();
		}
	}

	async receiveJoinTransaction(tx) {
		if (!tx || !tx.signature) {
			return;
		}

		let txmsg = tx.returnMessage();

		//Transaction must be signed
		if (!txmsg.invite_sig) {
			return;
		}

		//
		// game is the copy of the original invite creation TX stored in our object of arrays.
		//
		let game = this.returnGameTransaction(txmsg.game_id);
		//
		// If we don't find it, or we have already marked the game as active, stop processing
		//
		if (!game) {
			return;
		}

		//
		// Don't add the same player twice!
		//
		if (!game.msg.players.includes(tx.from[0].publicKey)) {
			if (this.isAvailableGame(game)) {
				if (txmsg.update_options) {
					console.info(
						`ARCADE: Join TX updates the invite options -- ${txmsg.update_options}!`,
						game.msg.options,
						txmsg.options
					);
					Object.assign(game.msg.options[txmsg.update_options], txmsg.options);
				}

				//
				// add player to game
				//
				game.msg.players.push(tx.from[0].publicKey);
				game.msg.players_sigs.push(txmsg.invite_sig);

				this.removeGame(txmsg.game_id);
				this.addGame(game);

				if (this.browser_active && this.ui) {
					this.ui.renderInvites();
				}
			} else {
				if (tx.isFrom(this.publicKey)) {
					salert('Game not available right now...');
					return;
				}
			}
		}

		// If this is an already initialized table game... stop
		if (game.msg.request == 'active' || game.msg.request == 'over') {
			return;
		}

		//
		// Do we have enough players?
		//
		if (game.msg.players.length >= game.msg.players_needed) {
			//
			// Temporarily change it so we don't process additional joins
			//
			game.msg.request = 'accepted';

			//
			// First player (originator) sends the accept message
			//
			if (
				game.msg.originator == this.publicKey ||
				(tx.isFrom(this.publicKey) && game.msg.options?.async_dealing)
			) {
				let newtx = await this.createAcceptTransaction(game);
				if (!newtx) {
					console.warn('ARCADE: createAcceptTransaction returned nothing; skipping propagate and initializer');
					return;
				}
				this.app.network.propagateTransaction(newtx);
				this.app.connection.emit('relay-send-message', {
					recipient: 'PEERS',
					request: 'arcade spv update',
					data: newtx.toJson()
				});

				//Start Spinner
				this.render('initializer_overlay', { game_id: txmsg.game_id });
			}
		}
	}

	async sendLeaveTransaction(invite_tx, data) {
		let txmsg = invite_tx.returnMessage();

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		for (let player of txmsg.players) {
			newtx.addTo(player);
		}

		newtx.addTo(this.publicKey);

		newtx.msg = JSON.parse(JSON.stringify(txmsg));
		newtx.msg.module = 'Arcade';
		newtx.msg.request = 'leave';
		newtx.msg.game_id = invite_tx.signature;
		newtx.msg.data = data;

		await newtx.sign();

		this.app.network.propagateTransaction(newtx);

		this.app.connection.emit('relay-send-message', {
			recipient: 'PEERS',
			request: 'arcade spv update',
			data: newtx.toJson()
		});

		//this.app.browser.logMatomoEvent('GameInvite', 'LeaveGame', txmsg.game);
		if (this.browser_active && this.ui) {
			this.ui.renderInvites();
		}
	}

	async receiveLeaveTransaction(tx) {
		if (!tx || !tx.signature) {
			return;
		}

		let txmsg = tx.returnMessage();

		//
		// game is the copy of the original invite creation TX stored in our object of arrays.
		//
		let game = this.returnGameTransaction(txmsg.game_id);

		//
		// If we don't find it, or we have already marked the game as active, stop processing
		//
		if (!game) {
			return;
		}

		//
		// Don't remove the same player twice!
		//
		if (game.msg.players.includes(tx.from[0].publicKey)) {
			let index = game.msg.players.indexOf(tx.from[0].publicKey);
			game.msg.players.splice(index, 1);
			game.msg.players_sigs.splice(index, 1);

			if (!game.msg.options?.eliminated) {
				game.msg.options.eliminated = {};
			}

			game.msg.options.eliminated[tx.from[0].publicKey] = txmsg.data;

			this.removeGame(txmsg.game_id);
			this.addGame(game);

			if (this.browser_active && this.ui) {
				this.ui.renderInvites();
			}
		}
	}

	/////////////////
	// ACCEPT GAME //
	/////////////////
	//
	// this transaction should be a valid game that has signatures from everyone
	// and is capable of initializing a game. if this TX is valid and has our
	// signature we will auto-accept it, kicking off the game.
	//
	async createAcceptTransaction(orig_tx) {
		if (!orig_tx || !orig_tx.signature) {
			console.error('ARCADE: Invalid Game Invite TX, cannot Accept');
			return;
		}

		// Use returnMessage() so we get the full message even if tx was deserialized (lazy .msg)
		let txmsg = orig_tx.returnMessage();
		if (!txmsg || !txmsg.players || txmsg.players.length === 0) {
			console.error('ARCADE: createAcceptTransaction -- invalid or empty message from orig_tx', orig_tx.signature);
			return;
		}
		// Provide originator if missing: open-invite creator is always the first player
		if (txmsg.originator == null || txmsg.originator === '') {
			txmsg.originator = txmsg.players[0];
		}

		let newtx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
		for (let i = 0; i < txmsg.players.length; i++) {
			newtx.addTo(txmsg.players[i]);
		}

		newtx.msg = JSON.parse(JSON.stringify(txmsg));
		newtx.msg.module = 'Arcade';
		newtx.msg.game_id = orig_tx.signature;
		newtx.msg.request = 'accept';

		await newtx.sign();

		return newtx;
	}

	async receiveAcceptTransaction(tx) {
		//Must be valid tx
		if (!tx) {
			console.error('ARCADE: Invalid Accept tx');
			return;
		}
		let txmsg = tx.returnMessage();

		if (!txmsg) {
			console.error('ARCADE: receiveAcceptTransaction -- tx.returnMessage() is null; cannot initialize', tx?.signature);
			return;
		}
		if (txmsg.originator == null || txmsg.originator === '') {
			console.error('ARCADE: receiveAcceptTransaction -- originator missing in accept tx; refusing to pass to game engine', txmsg.game_id);
			return;
		}

		//
		// Must have game module installed
		// We call the game-initialization function directly on gamemod further down
		//
		let gamemod = this.app.modules.returnModule(txmsg.game);

		// I guess this safety catch should be further up the processing chain, like we shouldn't even display an invite/join a game we don't have installed
		if (!gamemod) {
			console.error('ARCADE Error Initializing! Game Module not Installed -- ' + txmsg.game);
			return;
		}

		let game = this.returnGameTransaction(txmsg.game_id);

		// Must be an available invite
		if (!game || (!this.isAvailableGame(game, 'accepted') && !txmsg.options?.async_dealing)) {
			console.warn('ARCADE: game not available to accept', game, txmsg);
			return;
		}

		// do not re-accept game already in my local storage (a consequence of game initialization)
		for (let i = 0; i < this.app?.options?.games?.length; i++) {
			if (this.app.options.games[i].id === txmsg.game_id) {
				console.debug('ARCADE: [receiveAcceptTX] game already accepted and in my options');
				return;
			}
		}

		//
		// Mark the game as accept, i.e. active
		//
		this.changeGameStatus(txmsg.game_id, 'active');

		//
		// If I am a player in the game, let's start it initializing
		//
		if (txmsg.players.includes(this.publicKey)) {
			if (!this.app.options.arcade[txmsg.game]) {
				this.app.options.arcade[txmsg.game] = 0;
			}
			this.app.options.arcade[txmsg.game]++;

			this.app.options.arcade.last_game = txmsg.game;

			await this.render('initializer_overlay', { game_id: txmsg.game_id });

			if (this.app.BROWSER == 1 && txmsg.players.length > 1) {
				siteMessage(txmsg.game + ' invite accepted', 5000);
			}

			/*
      So the game engine does a bunch of checks and returns false if something prevents the game
      from initializing, so... we should wait for feedback and nope out of the spinner if something breaks
      */

			let game_engine_id = await gamemod.initializeGameFromAcceptTransaction(tx);

			if (!game_engine_id || game_engine_id !== txmsg.game_id) {
				salert('Something went wrong with the game initialization: ' + game_engine_id);
			}
		}
	}

	async receivePeerStatusUpdateTransaction(tx) {
		let txmsg = tx.returnMessage();
		let pk = txmsg.data?.publickey;
		let status = txmsg.data?.status;
		if (!pk || !status) return 0;

		for (let id in this.games) {
			let record = this.games[id];
			if (record.tx.from[0].publicKey === pk) {
				record.is_sender_reachable = (status === 'online');
			}
		}

		if (this.app.BROWSER && this.browser_active && this.ui) {
			this.ui.renderInvites();
		}
		return 0;
	}

	///////////////
	// CHALLENGE //
	///////////////
	//
	// a direct invitation from one player to another
	//

	async createChallengeTransaction(game, players, options) {
		let timestamp = new Date().getTime();

		let accept_sig = await this.app.crypto.signMessage(
			`invite_game_${timestamp}`,
			await this.app.wallet.getPrivateKey()
		);

		let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(this.publicKey);

		let otherPlayer = null;

		console.debug(`ARCADE: direct challenge player -- `, players);

		for (let sendto of players) {
			if (sendto !== this.publicKey) {
				otherPlayer = sendto;
				tx.addTo(otherPlayer);
			}
		}

		if (!otherPlayer) {
			return null;
		}

		tx.msg = {
			timestamp: timestamp,
			module: 'Arcade',
			request: 'challenge',
			game,
			options,
			players_needed: players.length,
			players: [this.publicKey],
			players_sigs: [accept_sig],
			originator: this.publicKey,
			desired_opponent_publickey: otherPlayer
		};

		await tx.sign();

		return tx;
	}

	receiveChallengeTransaction(tx, blk = null) {
		if (!tx || !tx.signature) {
			return;
		}

		if (!tx.isTo(this.publicKey)) {
			return;
		}

		this.addGame(tx, 'private');

		let txmsg = tx.returnMessage();

		console.debug('ARCADE: receive challenge transaction', tx);

		if (!tx.isFrom(this.publicKey)) {
			this.challenge_tx = tx;
		}

		this.app.connection.emit('arcade-challenge-issued', tx);
	}

	/*
  Update the Games Table with a new list of players+signatures for the multiplayer game
  (works for adding or subtracting players and enforces consistent ordering)
  *****
  DO NOT DELETE THIS FUNCTION AGAIN UNLESS WE WANT TO GET RID OF MULTIPLAYER GAMES
  *****
  */
	async updatePlayerListSQL(id, keys, sigs) {
		if (!this.app.BROWSER) {
			//Copy arrays to new data structures
			keys = keys.slice();
			sigs = sigs.slice();
			let players_array = keys.shift() + '/' + sigs.shift();

			if (keys.length !== sigs.length) {
				console.error('ARCADE [updatePlayerListSQL] key/player Length mismatch');
			}

			while (keys.length > 0) {
				let minIndex = 0;
				for (let i = 1; i < keys.length; i++) {
					if (keys[i] < keys[minIndex]) {
						minIndex = i;
					}
				}
				players_array += `_${keys.splice(minIndex, 1)[0]}/${sigs.splice(minIndex, 1)[0]}`;
			}

			let sql = 'UPDATE games SET players_array = $players_array WHERE game_id = $game_id';
			let params = {
				$players_array: players_array,
				$game_id: id
			};

			await this.app.storage.runDatabase(sql, params, 'arcade');
		}
	}

	///////////////////////////////
	// "LOAD"ING AND RUNNING GAMES //
	///////////////////////////////

	//
	// single player game
	//
	async launchSinglePlayerGame(gameobj) {
		let opentx = await this.createOpenTransaction(gameobj);

		this.app.connection.emit('relay-send-message', {
			recipient: 'PEERS',
			request: 'arcade spv update',
			data: opentx.toJson()
		});
		this.addGame(opentx, 'private');

		let newtx = await this.createAcceptTransaction(opentx);
		if (!newtx) {
			console.warn('ARCADE: launchSinglePlayerGame -- createAcceptTransaction returned nothing');
			return;
		}

		this.app.network.propagateTransaction(newtx);
		this.app.connection.emit('relay-send-message', {
			recipient: 'PEERS',
			request: 'arcade spv update',
			data: newtx.toJson()
		});

		//Start Spinner
		this.render('initializer_overlay', { game_id: opentx.signature });
	}

	/************************************************************
   // functions to manipulate the local games list
   ************************************************************/

	//
	//Add a game (tx) to a specified list
	//
	addGame(tx, list = null) {
		if (!tx || !tx.msg || !tx.signature) {
			console.error("ARCADE: [addGame] Invalid Game TX, won't add to list", tx);
			return false;
		}

		if (this.games[tx.signature]) {
			return false;
		}

		if (list) {
			// status from caller
		} else {
			list = tx.msg?.request || 'open';
		}

		if (list !== 'over' && !list.includes('close')) {
			if (this.isMyGame(tx)) {
				list = 'mine';
			} else {
				if (tx.msg.players_needed <= tx.msg.players.length) {
					list = 'active';
				}
			}
		}

		this.games[tx.signature] = {
			tx,
			status: list,
			updated_at: Date.now(),
			is_sender_reachable: true
		};

		return true;
	}

	removeGame(game_id) {
		delete this.games[game_id];
	}

	returnGame(game_id) {
		return this.games[game_id] || null;
	}

	returnGameTransaction(game_id) {
		let record = this.returnGame(game_id);
		return record ? record.tx : null;
	}

	returnGamesWithFilter(filterObject) {
		return Object.values(this.games).filter((record) => {
			for (let key in filterObject) {
				if (record[key] !== filterObject[key]) return false;
			}
			return true;
		});
	}

	filterGames(predicateFn) {
		return Object.values(this.games).filter(predicateFn);
	}

	purge() {
		const INVITE_CUTOFF = 1500000; // 25 minutes
		const GAME_CUTOFF = 600000000;

		const now = new Date().getTime();
		let walletModified = false;

		// --- Expire open/mine to closed (previous setInterval logic) ---
		for (let id of Object.keys(this.games)) {
			let record = this.games[id];
			let g = record.tx;
			if ((record.status === 'mine' || record.status === 'open') && g.timestamp < now - INVITE_CUTOFF) {
				this.removeGame(g.signature);
				this.addGame(g, 'closed');
			}
		}

		// --- Purge this.games by age ---
		for (let id of Object.keys(this.games)) {
			let record = this.games[id];
			let cutoff = now - INVITE_CUTOFF;
			if (record.status === 'active' || record.status === 'over' || record.status === 'mine') {
				cutoff = now - GAME_CUTOFF;
			}
			if (record.tx.timestamp <= cutoff) {
				delete this.games[id];
			}
		}

		if (this.app.BROWSER) {
			// Second pass: expire my invites that are not available
			let cutoff = now - INVITE_CUTOFF;
			for (let id of Object.keys(this.games)) {
				let record = this.games[id];
				if (record.status !== 'mine') continue;
				if (!this.isAvailableGame(record.tx) && record.tx.timestamp < cutoff) {
					siteMessage('Game invite timed out...', 4000);
					delete this.games[id];
				}
			}
		}

		// --- Purge malformed wallet games (from purgeBadGamesFromWallet) ---
		if (this.app.options.games) {
			for (let i = this.app.options.games.length - 1; i >= 0; i--) {
				if (this.app.options.games[i].module === '' && this.app.options.games[i].id.length < 25) {
					this.app.options.games.splice(i, 1);
					walletModified = true;
				} else if (this.app.options.games[i].players_set == 0) {
					//This will be games created but not fully initialized for whatever reason
					this.app.options.games.splice(i, 1);
					walletModified = true;
				}
			}
		}

		// --- Purge completed/old wallet games (from purgeOldGamesFromWallet) ---
		if (this.app.options.games) {
			for (let i = this.app.options.games.length - 1; i >= 0; i--) {
				let g = this.app.options.games[i];
				if (g.over >= 1) {
					if (g.timestamp < now - 240000) {
						// after 1 hour
						this.app.options.games.splice(i, 1);
						walletModified = true;
					}
				}
			}
		}

		if (walletModified) {
			this.app.storage.saveOptions();
		}
	}

	removeGameFromWallet(game_id) {
		this.removeGame(game_id);
		if (this.app.options.games) {
			for (let i = 0; i < this.app.options.games.length; i++) {
				if (this.app.options.games[i].id === game_id) {
					this.app.options.games.splice(i, 1);
					break;
				}
			}
		}
		this.app.storage.saveOptions();
		if (this.browser_active && this.ui) {
			this.ui.renderInvites();
		}
	}

	isAvailableGame(game_tx, additional_status = '') {
		if (game_tx.msg.request == 'open' || game_tx.msg.request == 'private') {
			return true;
		}
		if (game_tx.msg.request == 'active' && game_tx.msg.options['open-table']) {
			return true;
		}
		if (additional_status && additional_status === game_tx.msg.request) {
			return true;
		}
		return false;
	}

	//
	// Determines whether the user is in any way associated with the game
	// Either they sent the invite, they have clicked join, or someone specifically invited them by key
	//
	isMyGame(tx) {
		for (let i = 0; i < tx.to.length; i++) {
			if (tx.to[i].publicKey == this.publicKey) {
				return true;
			}
		}
		for (let i = 0; i < tx.msg.players.length; i++) {
			if (tx.msg.players[i] == this.publicKey) {
				return true;
			}
		}
		if (tx.msg.options) {
			if (tx.msg.options.desired_opponent_publickey) {
				if (tx.msg.options.desired_opponent_publickey == this.publicKey) {
					return true;
				}
			}
		}
		return false;
	}

	returnOpenInvites() {
		return this.filterGames(
			(r) =>
				r.status === 'mine' &&
				this.isAvailableGame(r.tx) &&
				this.publicKey == r.tx.msg.originator
		).map((r) => r.tx.signature);
	}

	shouldAffixCallbackToModule(modname) {
		if (modname == 'Arcade') {
			return 1;
		}
		for (let i = 0; i < this.affix_callbacks_to.length; i++) {
			if (this.affix_callbacks_to[i] == modname) {
				return 1;
			}
		}
		return 0;
	}

	isSlug(slug) {
		if (slug == this.returnSlug()) {
			return true;
		}
		return false;
	}

	webServer(app, expressapp, express, alternative_slug = null) {
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		const arcade_self = this;

		expressapp.use(uri, express.static(webdir));

		expressapp.get(uri, async function (req, res) {
			let reqBaseURL = req.protocol + '://' + req.headers.host + '/';
			let game_data = null;
			let updatedSocial = Object.assign({}, arcade_self.social);

			updatedSocial.url = reqBaseURL + encodeURI(arcade_self.returnSlug());

			if (Object.keys(req.query).length > 0) {
				let query_params = req.query;

				let game = query_params?.game || query_params?.view_game;

				if (typeof game === 'string') {
					let gm = app.modules.returnModule(game);
					if (gm) {
						updatedSocial.title = `Play <em>${gm.returnName()}</em> on the Saito Arcade`;
						updatedSocial.image = `${reqBaseURL + gm.returnSlug()}/img/arcade/arcade-banner-background.png`; /*arcade.jpg*/
						updatedSocial.description = gm.description;
						delete updatedSocial.url;
					}
				}

				let id = query_params?.game_id;
				game_data = arcade_self
					.filterGames(
						(r) =>
							r.tx.game == game &&
							arcade_self.app.crypto.hash(r.tx.signature).slice(-6) === id
					)[0]?.tx ?? null;

				console.log('WEBSERVER ARCADE GAME DATA --- ', game_data);
			}

			let html = arcadeHome(app, arcade_self, app.build_number, updatedSocial, game_data);
			if (!res.finished) {
				res.setHeader('Content-type', 'text/html');
				res.charset = 'UTF-8';
				return res.send(html);
			}
			return;
		});

	}

	showShareLink(game_sig, show = true) {
		let data = {};
		let accepted_game_tx = null;
		let accepted_game_msg = null;

		//Add more information about the game
		let record = this.returnGame(game_sig);
		if (record) {
			accepted_game_tx = record.tx;
		}

		if (accepted_game_tx) {
			accepted_game_msg = accepted_game_tx.msg;

			data.game = accepted_game_msg.game;
			data.game_id = this.app.crypto.hash(game_sig).slice(-6);
			data.path = '/arcade/';
			data.invite = 1;
			if (accepted_game_msg?.options?.crypto) {
				data.crypto = accepted_game_msg.options.crypto;
			}

			// This is not a meaningful safety catch... the sharelink button is only available for available games...
			if (accepted_game_msg.players_needed > 1) {
				let game_invitation_link = new GameInvitationLink(this.app, this, data);
				game_invitation_link.render(show);
			} else {
				console.error('no players needed');
			}
		} else {
			console.error('Game not available');
		}
	}

	async makeGameInvite(options, gameType = 'open', invite_obj = {}) {
		let game = options.game;
		let game_mod = this.app.modules.returnModule(game);
		let players_needed = options['game-wizard-players-select'];

		//
		// add league_id to options if this is a league game
		//
		if (invite_obj.league) {
			//The important piece of information
			options.league_id = invite_obj.league.id;
			//For convenience sake when making the join overlay
			options.league_name = invite_obj.league.name;
		}
		if (invite_obj.publicKey) {
			options.desired_opponent_publickey = invite_obj.publicKey;
			gameType = 'direct';
		}
		if (invite_obj.gameobj) {
			options.gameobj = invite_obj.gameobj;
			gameType = 'import';
		}

		if (!players_needed) {
			console.error('ARCADE: [makeGameInvite] error, missing players_needed', options);
			return;
		}

		let gamedata = {
			ts: new Date().getTime(),
			name: game,
			slug: game_mod.returnSlug(),
			options: options,
			players_needed: players_needed,
			invitation_type: gameType
		};

		// Poker Validation
		if (options['open-table']) {
			if (options.stake && typeof options.stake === 'object') {
				await salert('Uneven staking is not allowed in cash games');
				options.stake = options.stake[this.publicKey].toString();
			}
		}

		if (players_needed == 1) {
			this.launchSinglePlayerGame(gamedata);
			return;
		} else {
			let open_invites = this.returnOpenInvites();
			if (open_invites.length > 0) {
				let c = await sconfirm(
					'You already have an open invite. Are you sure you want to create a new one?'
				);
				if (!c) {
					return;
				} else {
					c = await sconfirm('Would you like to close the other invites?');
					if (c) {
						for (let game_id of open_invites) {
							this.sendCancelTransaction(game_id);
						}
					}
				}
			}

			if (gameType == 'direct') {
				if (gamedata.players_needed > 2) {
					gamedata.invitation_type = 'open';
				} else {
					gamedata.invitation_type = 'private';
				}
			}

			let newtx = await this.createOpenTransaction(gamedata);

			if (gameType == 'import') {
				this.app.connection.emit('arcade-launch-game-import', newtx);
				return;
			}

			await this.app.network.propagateTransaction(newtx);
			this.app.connection.emit('relay-send-message', {
				recipient: 'PEERS',
				request: 'arcade spv update',
				data: newtx.toJson()
			});

			if (this.app.browser.isMobileBrowser(navigator.userAgent) && !this.browser_active) {
				siteMessage('creating game invite...', 1500);
			}

			this.game_timeout = setTimeout(() => {
				salert(
					"Haven't received confirmation of your game invite. Please check your network connections."
				);
			}, 10000);

			// Maybe better to process the tx when it comes back to us, so we know it got sent out...
			// Render game in my game list
			//this.addGame(newtx, gamedata.invitation_type);
		}
	}

	///////////////////////////////////////////////////////////////////////////
	////////////////////   GAME OBSERVER STUFF  ///////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	async observeGame(game_id, watch_live = false) {
		let game_tx = this.returnGameTransaction(game_id);

		if (!game_tx) {
			console.error('ARCADE: [observeGame] -- Game not found!');
			return;
		}

		console.info('ARCADE Observe Game: ', watch_live);

		let game_msg = game_tx.returnMessage();

		let game_mod = this.app.modules.returnModule(game_msg.game);

		this.render('initializer_overlay', { game_id });

		//We want to send a message to the players to add us to the game.accept list so they route their game moves to us as well
		game_msg.game_id = game_id;

		if (!this.app.options.games) {
			this.app.options.games = [];
		}

		if (!game_mod.doesGameExistLocally(game_id)) {
			console.info('ARCADE Observer -- Initialize game');
			//starts running the queue...
			await game_mod.initializeObserverMode(game_tx, watch_live);
		} else {
			console.info('ARCADE Observer -- Game already exists, load it');
			game_mod.loadGame(game_id);
			game_mod.game.player = 0;
		}

		if (watch_live) {
			game_mod.expecting_state = true;
			game_mod.sendMetaMessage('FOLLOW');
		}
	}
}

module.exports = Arcade;
