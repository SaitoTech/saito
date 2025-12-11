const LandsTemplate = require('./lands.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class LandsOverlay {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod, false, true, false);
		this.selected = [];
	}

	render(player = 0) {

		if (player == 0) {
			player = this.mod.game.player;
		}

		this.overlay.show(LandsTemplate());

		let player_info = this.mod.game.state.players_info[player - 1];

		let lands = player_info.cards.filter((c) => {
				let card = this.mod.deck[c.key];
				return card && card.type === 'land';
		});

		for (let land of lands) {
			this.app.browser.addElementToSelector(
				this.html(land.key) ,
				'.lands-overlay'
			);
		}

		this.attachEvents();
	}


	renderAndPayCost(cost = []) {

		this.selected = [];

		let player = this.mod.game.player;
		let player_info = this.mod.game.state.players_info[player - 1];
		let lands = player_info.cards.filter(
			(c) => this.mod.deck[c.key] && this.mod.deck[c.key].type === 'land' && c.tapped == 0
		);

		this.overlay.show(LandsTemplate());

		for (let land of lands) {
			this.app.browser.addElementToSelector(
				this.html(land.key) ,
				'.lands-overlay'
			);
		}

		this.attachPaymentEvents(cost);
	}

	


	attachEvents() {
	}


	attachPaymentEvents(cost) {

		let deck = this.mod.returnDeck();
		let required = this.countCost(cost);

		let paid = { red: 0, green: 0, blue: 0, black: 0, white: 0, any: 0 };
		let max_total =
			required.red +
			required.green +
			required.blue +
			required.black +
			required.white +
			required.any;

		$('.lands-overlay .card').off();
		$('.lands-overlay .card').on('click', (e) => {

			let key = e.currentTarget.id;
			let card = deck[key];
			if (!card || card.type !== 'land') { return; }
			if ($(e.currentTarget).hasClass('spent')) { return; }
			let color = card.color;

			if (this.canUseMana(required, paid, color)) {

				this.tapLand(e.currentTarget);
				this.selected.push(key);
				paid[color] += 1;
				required = this.reduceCost(required, color);

				if (this.isCostPaid(required)) {
					this.confirmPayment();
				}
			}
		});
	}

	tapLand(el) {
		$(el).addClass('spent');
		$(el).css({
			filter: 'grayscale(100%) brightness(0.7)',
			transform: 'rotate(-5deg) scale(0.95)',
			transition: 'all 0.2s ease',
		});
	}

	countCost(cost) {
		let tally = {
			red: 0,
			green: 0,
			blue: 0,
			black: 0,
			white: 0,
			any: 0,
		};
		for (let c of cost) {
			if (tally[c] !== undefined) { tally[c]++; }
			else if (c === '*') { tally.any++; }
		}
		return tally;
	}

	canUseMana(required, paid, color) {
		let total_needed =
			required.red +
			required.green +
			required.blue +
			required.black +
			required.white +
			required.any;
		if (total_needed <= 0) return false;
		if (required[color] > 0) return true;
		if (required.any > 0) return true;
		return false;
	}

	reduceCost(required, color) {
		let r = { ...required };
		if (r[color] > 0) { r[color]--; }
		else if (r.any > 0) { r.any--; }
		return r;
	}

	isCostPaid(required) {
		return (
			required.red +
				required.green +
				required.blue +
				required.black +
				required.white +
				required.any ===
			0
		);
	}

	confirmPayment() {

		let mod = this.mod;
		for (let key of this.selected) { mod.addMove(`tap\t${mod.game.player}\t${key}`); }
		mod.endTurn();
		this.overlay.hide();
	}


        html(key) {
		let realms_self = this.mod;

                return `
                        <div class="card .${key}" id="${key}">
                                ${realms_self.returnCardImage(key)}
                        </div>
                `;
        }

}

module.exports = LandsOverlay;
