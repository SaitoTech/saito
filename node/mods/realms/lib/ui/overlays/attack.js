const AttackTemplate = require('./attack.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class AttackOverlay {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.overlay = new SaitoOverlay(app, mod);
		this.selected = [];
	}

	render(player = 0 , obj = {}) {

		if (player === 0) player = this.mod.game.player;

		this.overlay.show(AttackTemplate());

		let deck = this.mod.deck;
		let player_info = this.mod.game.state.players_info[player - 1];

		let creatures = player_info.cards.filter((c) => {
			let card = deck[c.key];
			return card && card.type === 'creature' && c.tapped == 0;
		});

		for (let creature of creatures) {
			let card = deck[creature.key];
			this.app.browser.addElementToSelector(
				this.html(creature.key) ,
				'.my-creatures'
			);
		}

		this.attachEvents();
	}

	attachEvents() {
		let mod = this.mod;
		let app = this.app;

		$('.attack-overlay .my-creatures .card').off();
		$('.attack-overlay .my-creatures .card').on('click', (e) => {
			let key = e.currentTarget.id;

			if (this.selected.includes(key)) {
				this.selected = this.selected.filter((k) => k !== key);
				$(e.currentTarget).removeClass('selected');
				$(e.currentTarget).css({
					filter: 'none',
					transform: 'scale(1)',
				});
			} else {
				this.selected.push(key);
				$(e.currentTarget).addClass('selected');
				$(e.currentTarget).css({
					filter: 'brightness(0.8) saturate(1.4)',
					transform: 'scale(1.1)',
					transition: 'all 0.15s ease',
				});
			}
		});

		this.attachConfirmButton();
	}

	attachConfirmButton() {
		if (!$('.attack-overlay .confirm-attack').length) {
			$('.attack-overlay').append(
				`<div class="confirm-attack">CONFIRM ATTACK</div>`
			);
		}

		$('.attack-overlay .confirm-attack').off();
		$('.attack-overlay .confirm-attack').on('click', (e) => {
			this.confirmAttack();
		});
	}

	confirmAttack() {
		let mod = this.mod;

		if (this.selected.length === 0) {
			this.overlay.hide();
			return;
		}

		for (let key of this.selected) {
			mod.addMove(`attack\t${mod.game.player}\t${JSON.stringify(this.selected)}`);
		}

		mod.endTurn();

		this.overlay.hide();
	}

        html(key="") {
                let realms_self = this.mod;

                return `
                        <div class="card ${key}" id="${key}">
                                ${realms_self.returnCardImage(key)}
                        </div>
                `;
        }

}


module.exports = AttackOverlay;
