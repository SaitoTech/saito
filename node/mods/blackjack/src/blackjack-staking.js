

	initializeGameStake(crypto, stake) {
		this.game.crypto = this.game.options.crypto = crypto;
		this.game.stake = this.game.options.stake = parseFloat(stake);

		for (let i = 0; i < this.game.state.player.length; i++) {
			this.game.state.player[i].credit = parseFloat(stake);
			this.game.state.player[i].wager = 0;
			this.game.state.player[i].payout = 1;
			this.game.state.player[i].hand = [];
			this.game.state.player[i].total = 0;
			this.game.state.player[i].winner = null;
			this.game.state.player[i].split = [];
		}

		console.log('PLAYER STATE: ' + JSON.stringify(this.game.state.player));

		this.game.state.round = 1;

		//
		// and redisplay board
		//
		this.displayBoard();
	}

	nonDealerPlayers() {
		let players = [];
		for (let p = 1; p <= this.game.players.length; p++) {
			if (p != this.game.state.dealer) {
				players.push(p);
			}
		}
		return players;
	}

	settleLastRound() {
		let msg = 'Clearing the table';
		this.game.queue.push('newround');
		this.game.queue.push('PLAYERS');
		this.game.queue.push('checkplayers');
		this.game.queue.push('PLAYERS');

		if (this.game.crypto) {
			msg += this.game.crypto ? ' and settling bets...' : '...';
			for (let i = 0; i < this.settlement.length; i++) {
				this.game.queue.push(this.settlement[i]);
			}
		}

		this.updateStatus(msg);
		this.cardfan.hide();

		this.settlement = [];
	}

	areThereAnyBets() {
		for (let i = 0; i < this.game.state.player.length; i++) {
			if (i + 1 != this.game.state.dealer) {
				if (
					this.game.state.player[i].wager >
					0 /*&& this.game.state.player[i].payout!=2*/
				)
					return true;
			}
		}

		return false;
	}

	canSplit() {
		if (this.game.player == this.game.state.dealer) return false; //Must be a player
		let cards = this.game.state.player[this.game.player - 1].hand;
		if (cards.length != 2) return false; //Must have two cards (first move)
		let me = this.game.state.player[this.game.player - 1];
		if (me.credit < 2 * me.wager) return false; //Must have sufficient credit
		if (
			cards[0].length == 2 &&
			cards[1].length == 2 &&
			cards[0][1] == cards[1][1]
		)
			return true; //Cards must match Ace, 2, ... 9. Don't let players split 10s
		return false;
	}

	canDouble() {
		if (this.game.player == this.game.state.dealer) return false; //Must be a player
		let p = this.game.player - 1;
		if (this.game.state.player[p].split.length > 0) return false; //No double down on split (for now)
		if (
			this.game.state.player[p].credit >=
				2 * this.game.state.player[p].wager &&
			this.game.state.player[p].hand.length === 2
		)
			return true;
		else return false;
	}

	async selectWager() {
		let blackjack_self = this;

		//Should be tied to the stake, 1%, 5%, 10%, 20%

		let fractions = [0.01, 0.05, 0.1];
		let myCredit =
			this.game.state.player[blackjack_self.game.player - 1].credit;

		let html = `<div class="status-info">Select a wager: (credit: ${this.app.crypto.convertStringToDecimalPrecision(
			myCredit
		)})</div>`;
		html += '<ul>';
		for (let i = 0; i < fractions.length; i++) {
			if (fractions[i] * this.game.stake < myCredit)
				html += `<li class="menu_option" id="${
					fractions[i] * this.game.stake
				}">${fractions[i] * this.game.stake} ${this.game.crypto}</li>`;
		}
		//Add an all-in option when almost out of credit
		if (fractions.slice(-1) * this.game.stake > myCredit) {
			html += `<li class="menu_option" id="${myCredit}">All In!</li>`;
		}
		html += '</ul>';

		this.updateStatus(this.getLastNotice() + html, 1);
		this.lockInterface();
		try {
			$('.menu_option').off();
			$('.menu_option').on('click', async function () {
				$('.menu_option').off();
				blackjack_self.unlockInterface();
				let choice = $(this).attr('id');
				blackjack_self.addMove(
					'setwager\t' + blackjack_self.game.player + '\t' + choice
				);
				blackjack_self.endTurn();
			});
		} catch (err) {
			console.error('selectwager error', err);
		}
	}

