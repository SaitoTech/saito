const BoardTemplate = require('./board.template');
const ManaWheel = require('./mana');
const LandsOverlay = require('./overlays/lands');
const AttackOverlay = require('./overlays/attack');

class Board {

	constructor(app, mod, container = '.gameboard') {
		this.app = app;
		this.mod = mod;
		this.mana_player = new ManaWheel(app, mod, `.player .showcard[data-slot="1"]`);
		this.mana_opponent = new ManaWheel(app, mod, `.opponent .showcard[data-slot="1"]`);
		this.lands_overlay = new LandsOverlay(app, mod);
	}

	render() {


		//
		// track which player is which
		//
		let me = this.mod.game.player;
		let opponent = 1;
		if (me == 1) { opponent = 2; }
		this.mana_player.player = me;
		this.mana_opponent.player = opponent;

		//
		// reference variables
		//
		let realms_self = this.mod;
		let deck = realms_self.returnDeck();

		//
		// refresh board
		//
		if (document.querySelector(".gameboard .realms-board")) {
			this.app.browser.replaceElementBySelector(BoardTemplate(), ".gameboard .realms-board");
		} else {
			this.app.browser.addElementToSelector(
				BoardTemplate(),
				".gameboard"
			);
		}

		//
		// exit if needed
		//
   		if (!realms_self.deck) {
        		console.log("Board render: Game state not initialized yet, skipping...");
        		return;
    		}


		//
		// fetch cards for table
		//

		//
		// opponent cards
		//
		this.num = 0;
		this.mana_opponent.tapped = 0;
		this.mana_opponent.untapped = 0;
		this.mana_depicted = 0;
		let opponent_cards_on_table = realms_self.game.state.players_info[opponent - 1].cards;
		for (
			let i = 0, slots_needed = 5;
			i < opponent_cards_on_table.length || i < slots_needed;
			i++
		) {

			if (i >= opponent_cards_on_table.length) {

				realms_self.app.browser.addElementToSelector(
					this.html("") ,
					'.battlefield.opponent'
				);

			} else {

				let cobj = opponent_cards_on_table[i];
				let key = cobj.key;
				let card = deck[key];

				if (card.type == 'land') {
					if (cobj.tapped) { this.mana_opponent.tapped++; } else { this.mana_opponent.untapped++; }
					if (this.mana_depicted == 0) {
						realms_self.app.browser.addElementToSelector(
							this.html("") ,
							'.battlefield.opponent'
						);
						this.mana_depicted = 1;
					} else {
						slots_needed++;
					}
				}

				if (card.type == 'creature') {
					realms_self.app.browser.addElementToSelector(
						this.html(key, card) ,
						'.battlefield.opponent'
					);
				}

				if (card.type == 'artifact') {
					realms_self.app.browser.addElementToSelector(
						this.html(key, card) ,
						'.battlefield.opponent'
					);
				}
			}
		}
		if (this.mana_depicted == 1) { this.mana_opponent.render(); }


		//
		// player cards
		//
		this.num = 0;
		this.mana_depicted = 0;
		this.mana_player.tapped = 0;
		this.mana_player.untapped = 0;
		let player_cards_on_table = realms_self.game.state.players_info[realms_self.game.player - 1].cards;
		for (
			let i = 0, slots_needed = 5;
			i < player_cards_on_table.length || i < slots_needed;
			i++
		) {

			if (i >= player_cards_on_table.length) {

				realms_self.app.browser.addElementToSelector(
					this.html("") ,
					'.battlefield.player'
				);

			} else {

				let cobj = player_cards_on_table[i];
				let key = cobj.key;
				let card = deck[key];

				if (card.type == 'land') {
					if (cobj.tapped) { this.mana_player.tapped++; } else { this.mana_player.untapped++; }
					if (this.mana_depicted == 0) {
						realms_self.app.browser.addElementToSelector(
							this.html("", cobj) ,
							'.battlefield.player'
						);
						this.mana_depicted = 1;
					} else {
						slots_needed++;
					}
				}

				if (card.type == 'creature') {
					realms_self.app.browser.addElementToSelector(
						this.html(key, cobj) ,
						'.battlefield.player'
					);
				}

				if (card.type == 'artifact') {
					realms_self.app.browser.addElementToSelector(
						this.html(key, cobj) ,
						'.battlefield.player'
					);
				}

			}
		}
		if (this.mana_depicted == 1) { this.mana_player.render(); }

		this.attachEvents();

	}


	attachEvents() {

		let realms_self = this.mod;
		let player = this.mana_player.player;
		let opponent = this.mana_opponent.player;

		let opponent_cards_on_table = realms_self.game.state.players_info[opponent - 1].cards;
		let player_cards_on_table = realms_self.game.state.players_info[player - 1].cards;

		//
		// lands/color-wheel
		//
                document.querySelector(`.player .showcard[data-slot="1"]`).onclick = (e) => { this.lands_overlay.render(player); }
                document.querySelector(`.opponent .showcard[data-slot="1"]`).onclick = (e) => { this.lands_overlay.render(opponent); }

		//
		// cards on table
		//
		for (let z = 0; z < opponent_cards_on_table.length; z++) {
			let cobj = opponent_cards_on_table[z];
			let key = cobj.key;
			this.attachCardEvents(key, cobj);
		}
		for (let z = 0; z < player_cards_on_table.length; z++) {
			let cobj = player_cards_on_table[z];
			let key = cobj.key;
			this.attachCardEvents(key, cobj);
		}

	}

	attachCardEvents(key, card=null) {

		let realms_self = this.mod;
		let player = realms_self.game.state.players_info[realms_self.game.player - 1];

		let obj = $(`.${key}`);
		if (!obj) { return; }
		
		$(`.${key}`).off();
        	$(`.${key}`).on('mouseover', (e) => {
			realms_self.cardbox.show(key);
            	});
        	$(`.${key}`).on('mouseout', (e) => {
			realms_self.cardbox.hide();
            	});

		$('.can_attack').on('click', (e) => {
			let id = e.currentTarget.id;
			let slot = e.currentTarget.dataset.slot;
			realms_self.playerStartAttack(id);
		});
		$('.can_event').on('click', (e) => {
			let id = e.currentTarget.id;
			let slot = e.currentTarget.dataset.slot;
			realms_self.playerTriggerEvent(id);
		});
		$('.can_multievent').off();
		$('.can_multievent').on('click', (e) => {
			let id = e.currentTarget.id;
			let slot = e.currentTarget.dataset.slot;
			realms_self.playerTriggerMultiEvent(id);
		});

	}


	html(key="", cobj=null) {

		let realms_self = this.mod;
		let deck = realms_self.deck;
		let card = null;

		this.num++;

		if (key == "") {
			return `<div class="showcard card-container ${key}" id="${key}" data-slot="${this.num}"></div>`;
		}


		if (realms_self.deck[key]) { card = realms_self.deck[key]; }

		let player = realms_self.game.state.players_info[realms_self.game.player - 1];


		let is_tapped = "";
		let can_attack = "";
		let can_event = "";
		let can_multievent = "";
		let number_of_actions = 0; 

		if (cobj != null) {
		  if (cobj.tapped) { is_tapped = "tapped "; }
		}

		if (card != null) {
			if (card.type === "creature" && cobj.tapped == 0) 	{
				if (player.combat_started == 0) {
					can_attack = "can_attack ";
					number_of_actions++;
				}
			}
			if (card.canEvent() && cobj.tapped == 0) 		{
				can_event = "can_event ";
				number_of_actions++;
			}
			if (number_of_actions > 1 && cobj.tapped == 0)	{
				can_multievent = "can_multievent ";
			}		
		}

		return `
			<div class="showcard card-container ${key} ${is_tapped} ${can_attack} ${can_event} ${can_multievent}" id="${key}" data-slot="${this.num}">
				${realms_self.returnCardImage(key)}
			</div>
		`;
	}


	refreshPlayerMana(player_num) {
	  if (this.mana_player.player == player_num) { this.mana_player.tapped_add_pop = 1; this.mana_player.untapped_add_pop = 1; }
	  if (this.mana_opponent.player == player_num) { this.mana_opponent.tapped_add_pop = 1; this.mana_opponent.untapped_add_pop = 1; }
	}
}

module.exports = Board;
