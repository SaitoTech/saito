
	async playerTurn() {
		let blackjack_self = this;
		let html;

		if (
			!this.areThereAnyBets() &&
			this.game.player == this.game.state.dealer
		) {
			//Check if Dealer need to play -- blackjacks too!
			html = this.getLastNotice();
			html += `<div class="menu-player">There is no one left to play against</div>`;
			html += `<ul><li class="menu_option" id="stand">end round</li></ul>`;
		} else {
			//Let Player or Dealer make choice
			html = `<div class="menu-player">You have ${
				this.game.state.player[this.game.player - 1].total
			}, your move:</div><ul>`;
			html += `<li class="menu_option" id="stand" title="end your turn">stand</li>`;
			if (this.game.state.player[this.game.player - 1].total < 21) {
				html += `<li class="menu_option" id="hit" title="get another card">hit</li>`;
			}
			if (this.canDouble()) {
				html += `<li class="menu_option" id="double" title="double your bet for one card">double down</li>`;
			}
			if (this.canSplit()) {
				html += `<li class="menu_option" id="split" title="double your bet to split to two hands">split</li>`;
			}
			html += '</ul>';
		}

		this.updateStatus(html, 1);
		this.lockInterface();

		$('.menu_option').off();
		$('.menu_option').on('click', async function () {
			$('.menu_option').off();
			blackjack_self.unlockInterface();
			let choice = $(this).attr('id');

			if (choice === 'hit') {
				blackjack_self.addMove('hit\t' + blackjack_self.game.player);
				blackjack_self.endTurn();
				return 0;
			}

			if (choice === 'stand') {
				//blackjack_self.addMove("RESOLVE\t"+blackjack_self.publicKey);
				blackjack_self.addMove('stand\t' + blackjack_self.game.player);
				blackjack_self.endTurn();
				return 0;
			}

			if (choice === 'double') {
				blackjack_self.addMove('double\t' + blackjack_self.game.player);
				blackjack_self.endTurn();
				return 0;
			}

			if (choice === 'split') {
				blackjack_self.addMove('split\t' + blackjack_self.game.player);
				blackjack_self.endTurn();
				return 0;
			}
		});
	}


	async endTurn(nextTarget = 0) {
		if (this.browser_active) {
			$('.menu_option').off();
		}

		super.endTurn();
	}

