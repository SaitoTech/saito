const GameTableTemplate = require('../../lib/templates/table-gametemplate');
const saito = require('../../lib/saito/saito');
const BlackjackGameRulesTemplate = require('./lib/core/blackjack-game-rules.template');
const htmlTemplate = require('./lib/core/game-html.template');
const GameBoard = require('./lib/ui/game-board');


//////////////////
// CONSTRUCTOR  //
//////////////////
class Blackjack extends GameTableTemplate {

	constructor(app) {
		super(app);

		this.app = app;
		this.name = 'Blackjack';
		this.slug = 'blackjack';
		this.title = "Saito Blackjack";

		this.description = 'Classic casino game with home rules. Try to get closest to 21 without going over and beat the dealer to win your bet, but look out! You may be dealer next hand.';

		this.categories = 'Games Cardgame Casino';

		this.card_img_dir = '/saito/img/arcade/cards';

		this.minPlayers = 2;
		this.maxPlayers = 6;

		this.settlement = [];
		this.updateHTML = '';
		this.decimal_precision = 8;

		return this;
	}

	async render(app) {

		if (!this.browser_active) {
			return;
		}
		if (this.initialize_game_run) {
			return;
		}

		await this.injectGameHTML(htmlTemplate());

		await super.render(app);

		//
		// ADD MENU
		//
		this.menu.addMenuOption('game-game', 'Game');
		this.menu.addMenuOption('game-info', 'Info');

		this.menu.addSubMenuOption('game-info', {
			text: 'Help',
			id: 'game-intro',
			class: 'game-intro',
			callback: function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				game_mod.overlay.show(game_mod.returnGameRulesHTML());
			}
		});
		this.menu.addSubMenuOption('game-info', {
			text: 'Log',
			id: 'game-log',
			class: 'game-log',
			callback: function (app, game_mod) {
				game_mod.menu.hideSubMenus();
				game_mod.log.toggleLog();
			}
		});

		//
		// flat or 3d theme
		//
                this.theme = this.app.browser.isMobileBrowser() ? 'flat' : 'threed';
                if (this.loadGamePreference('poker-theme')) {
                        this.theme = this.loadGamePreference('poker-theme');
                }
                if (this.loadGamePreference('poker-cards')) {
                        this.card_img = this.loadGamePreference('poker-cards');
                }
                if (this.loadGamePreference('poker-felt')) {
                        this.felt = this.loadGamePreference('poker-felt');
                }


		this.menu.addChatMenu();
		this.menu.render();

		this.log.render();

		this.playerbox.render();
		//this.playerbox.addClassAll('poker-seat-', true);
		//this.playerbox.addGraphicClass('hand');
		//this.playerbox.addGraphicClass('tinyhand');
		//this.playerbox.addStatus(); //enable update Status to display in playerbox
		this.updateStatus('Waiting for other players to sit down to start playing');

	}

	respondTo(type) {
		return super.respondTo(type);
	}

	initializeGame() {

		this.board = new GameBoard(this.app, this);

		if (!this.game.state) {

			//
			// initialize
			//
			if (this.game.options?.crypto) {
				this.game.crypto = this.game.options.crypto || '';
				this.game.stake = this.game.options.stake
					? parseFloat(this.game.options.stake)
					: 500;
			} else {
				this.game.stake = 500;
				this.game.crypto = '';
			}
	
			this.game.state = this.returnState(this.game.players.length);
			this.updateStatus('Generating the Game');
			this.game.queue = [];
			this.game.queue.push('start');
      			this.game.queue.push("READY");

			let minbet = (this.game.stake / 100).toString();
			if (minbet.includes('.')) {
				this.decimal_precision = 8;
				//this.decimal_precision = minbet.split(".")[1].length;
			}
		}

		
	}

	returnGameRulesHTML() {
		return BlackjackGameRulesTemplate(this.app, this);
	}

	returnGameOptionsHTML() {
		let options_html = `<h1 class="overlay-title">Blackjack Options</h1>`;

		return options_html;
	}

	attachAdvancedOptionsEventListeners() {
		let crypto = document.getElementById('crypto');
		let stakeInput = document.getElementById('stake_input');

		if (crypto) {
			crypto.onchange = () => {
				if (crypto.value == '') {
					stakeInput.style.display = 'none';
				} else {
					stakeInput.style.display = 'block';
				}
			};
		}
	}

	payWinners(winner) {
		return 0;
	}

	async receiveStopGameTransaction(resigning_player, txmsg) {
		await super.receiveStopGameTransaction(resigning_player, txmsg);

		if (!txmsg.loser) {
			return;
		}

		let player = parseInt(txmsg.loser);

		if (player != this.game.state.dealer) {
			//Player, not dealer
			let wager = this.game.state.player[player - 1].wager;
			if (wager > 0) {
				this.game.state.player[this.game.state.dealer - 1].wager +=
					wager;
				this.game.state.player[player - 1].wager = 0;
				this.game.state.player[player - 1].credit = 0;
			}

			this.updateHTML += `<div class="h3 justify"><span>${
				this.game.state.player[player - 1].name
			}: Quit the game!</span><span>Loss:${wager}</span></div>`;
			this.updateHTML += this.handToHTML(
				this.game.state.player[player - 1].hand
			);

			if (this.game.crypto) {
				let ts = new Date().getTime();
				this.rollDice();
				let uh = this.game.dice;
				this.game.queue.push(
					`SEND\t${this.game.players[player - 1]}\t${
						this.game.players[this.game.state.dealer - 1]
					}\t${wager.toFixed(
						this.decimal_precision
					)}\t${ts}\t${uh}\t${this.game.crypto}`
				);
			}
		}
	}

