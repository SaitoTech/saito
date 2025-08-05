
	scoreArrayOfCards(array_of_cards) {
		let total = 0;
		let aces = 0;
		for (let i = 0; i < array_of_cards.length; i++) {
			let card = array_of_cards[i];
			//card[0] is suit, Ace is stored as a 1
			if (card[1] === '1' && card.length == 2) {
				total += parseInt(1);
				aces++;
			} else {
				let card_total = parseInt(card.substring(1));
				if (card_total > 10) {
					card_total = 10;
				}
				total += parseInt(card_total);
			}
		}

		for (let z = 0; z < aces; z++) {
			if (total + 10 <= 21) {
				total += 10;
			}
		}

		if (total > 21) return -1;
		return total;
	}

	myCards() {
		if (this.game.state.player[this.game.player - 1].split.length > 0) {
			return this.game.state.player[this.game.player - 1].hand;
		}
		let array_of_cards = [];

		for (let i of this.game.deck[0].hand) {
			array_of_cards.push(this.game.deck[0].cards[i].name);
		}
		return array_of_cards;
	}

	async pickWinner() {

		let dealerScore = this.game.state.player[this.game.state.dealer - 1].total;

		for (let i = 0; i < this.game.state.player.length; i++) {
			this.game.state.player[i].winner =
				this.game.state.player[i].total > dealerScore;
		}

		let winners = [];
		let losers = [];
		let debt = 0;
		let logMsg = '';
		let dealerHTML = '';
		let playerHTML = '';

		if (dealerScore < 0) {
			dealerHTML = '<h1>Dealer Busts!</h1>';
		}

		//If Dealer Blackjack
		if (this.game.state.blackjack == 1) {
			dealerHTML = '<h1>Dealer Blackjack!</h1>';

			logMsg = 'Dealer blackjack! ';
			for (let i = 0; i < this.game.state.player.length; i++) {
				if (i != this.game.state.dealer - 1) {
					//Not the Dealer
					//If the player also has a blackjack
					if (this.game.state.player[i].total === 21) {
						debt = this.game.state.player[i].wager;
					} else {
						debt = this.game.state.player[i].wager * 2;
					}
					//Don't collect more than a player has
					debt = Math.min(debt, this.game.state.player[i].credit);

					//Temporarily store all chips collected from players in the dealer's "wager"
					this.game.state.player[this.game.state.dealer - 1].wager +=
						debt;
					this.game.state.player[i].credit -= debt;
					this.game.state.player[i].wager = 0;
					playerHTML += `<div class="h3 justify"><span>${
						this.game.state.player[i].name
					}: ${
						this.game.state.player[i].total
					} loses to blackjack.</span><span>Loss: ${debt.toFixed(
						this.decimal_precision
					)}</span></div>`;
					playerHTML += this.handToHTML(
						this.game.state.player[i].hand
					);

					logMsg += `Player ${i + 1} loses ${debt.toFixed(
						this.decimal_precision
					)}, `;
					//Check for bankruptcy to personalize message
					if (this.game.state.player[i].credit <= 0) {
						logMsg += 'going bankrupt, ';
					}

					if (this.game.crypto) {
						let ts = new Date().getTime();
						this.rollDice();
						let uh = this.game.dice;
						this.settlement.push(
							`SEND\t${this.game.players[i]}\t${
								this.game.players[this.game.state.dealer - 1]
							}\t${debt.toFixed(
								this.decimal_precision
							)}\t${ts}\t${uh}\t${this.game.crypto}`
						);
					}

					losers.push(this.game.players[i]);
				}
			}
		} else {
			//Otherwise, normal processing, some players win, some lose
			//Update each player
			let sender, receiver;

			for (let i = 0; i < this.game.state.player.length; i++) {
				if (i != this.game.state.dealer - 1) {
					//Not the Dealer
					if (this.game.state.player[i].wager > 0) {
						//Player still has something to resolve
						debt = this.game.state.player[i].wager;
						if (this.game.state.player[i].winner) {
							winners.push(this.game.players[i]);
							this.game.state.player[
								this.game.state.dealer - 1
							].wager -= debt;
							this.game.state.player[i].credit += Math.min(
								debt,
								this.game.state.player[
									this.game.state.dealer - 1
								].credit
							);
							logMsg += `Player ${i + 1} wins ${debt.toFixed(
								this.decimal_precision
							)}, `;
							sender =
								this.game.players[this.game.state.dealer - 1];
							receiver = this.game.players[i];
						} else {
							losers.push(this.game.players[i]);
							debt = Math.min(
								debt,
								this.game.state.player[i].credit
							);
							this.game.state.player[
								this.game.state.dealer - 1
							].wager += debt;
							this.game.state.player[i].credit -= debt;

							logMsg += `Player ${i + 1} loses ${debt.toFixed(
								this.decimal_precision
							)}, `;
							if (this.game.state.player[i].credit <= 0) {
								logMsg += 'going bankrupt, ';
							}
							receiver =
								this.game.players[this.game.state.dealer - 1];
							sender = this.game.players[i];
						}
						playerHTML += `<div class="h3 justify"><span>${
							this.game.state.player[i].name
						}: ${this.game.state.player[i].total}.</span><span>${
							this.game.state.player[i].winner ? 'Win' : 'Loss'
						}: ${Math.abs(debt).toFixed(
							this.decimal_precision
						)}</span></div>`;
						playerHTML += this.handToHTML(
							this.game.state.player[i].hand
						);
						if (this.game.crypto) {
							let ts = new Date().getTime();
							this.rollDice();
							let uh = this.game.dice;
							this.settlement.push(
								`SEND\t${sender}\t${receiver}\t${debt.toFixed(
									this.decimal_precision
								)}\t${ts}\t${uh}\t${this.game.crypto}`
							);
						}
						this.game.state.player[i].wager = 0;
					} else {
						if (this.game.state.player[i].total == 21) {
							winners.push(this.game.players[i]);
						} else {
							losers.push(this.game.players[i]);
						}
					}
					//check and process secondary hands
					for (let z of this.game.state.player[i].split) {
						let ts = this.scoreArrayOfCards(z);
						if (ts > 0 && (z.length > 2 || ts < 21)) {
							//Busts & blackjacks get ignored
							playerHTML += `<div class="h3 justify"><span>${this.game.state.player[i].name}: ${ts}.</span>`;
							if (ts > dealerScore) {
								this.game.state.player[
									this.game.state.dealer - 1
								].wager -= debt;
								this.game.state.player[i].credit += debt;
								logMsg += `Player ${i + 1} wins ${debt.toFixed(
									this.decimal_precision
								)}, `;
								playerHTML += `<span>Win: ${debt.toFixed(
									this.decimal_precision
								)}</span></div>`;
								sender =
									this.game.players[
										this.game.state.dealer - 1
									];
								receiver = this.game.players[i];
							} else {
								debt = Math.min(
									debt,
									this.game.state.player[i].credit
								);
								this.game.state.player[
									this.game.state.dealer - 1
								].wager += debt;
								this.game.state.player[i].credit -= debt;
								logMsg += `Player ${i + 1} loses ${debt.toFixed(
									this.decimal_precision
								)}, `;
								if (this.game.state.player[i].credit <= 0) {
									logMsg += 'going bankrupt, ';
								}
								playerHTML += `<span>Loss: ${debt.toFixed(
									this.decimal_precision
								)}</span></div>`;
								receiver =
									this.game.players[
										this.game.state.dealer - 1
									];
								sender = this.game.players[i];
							}
							playerHTML += this.handToHTML(z);

							if (this.game.crypto) {
								let ts = new Date().getTime();
								this.rollDice();
								let uh = this.game.dice;
								this.settlement.push(
									`SEND\t${sender}\t${receiver}\t${debt.toFixed(
										this.decimal_precision
									)}\t${ts}\t${uh}\t${this.game.crypto}`
								);
							}
						}
					}
				}
			}
		}
		playerHTML += this.updateHTML; //Add other players who already resolved their turn

		logMsg = logMsg.substring(0, logMsg.length - 2); //remove comma

		//Update Dealer
		let dealerEarnings =
			this.game.state.player[this.game.state.dealer - 1].wager;
		this.game.state.player[this.game.state.dealer - 1].credit +=
			dealerEarnings;

		let dealerLog = '';
		if (dealerEarnings > 0) {
			dealerLog = `Dealer wins ${dealerEarnings.toFixed(
				this.decimal_precision
			)} for the round.`;
		} else if (dealerEarnings < 0) {
			dealerLog = `Dealer pays out ${Math.abs(dealerEarnings).toFixed(
				this.decimal_precision
			)} for the round.`;
		} else {
			dealerLog = `Dealer has no change in credits.`;
		}
		logMsg += `${logMsg ? '. ' : ''}${dealerLog}`;
		dealerHTML += `<div class="h2">${dealerLog}</div>`;
		dealerHTML += `<div class="h3">${
			this.game.state.player[this.game.state.dealer - 1].name
		} (Dealer): ${dealerScore > 0 ? dealerScore : 'Bust'}</div>`;
		dealerHTML += this.handToHTML(
			this.game.state.player[this.game.state.dealer - 1].hand
		);
		//Bankruptcy Check
		if (this.game.state.player[this.game.state.dealer - 1].credit <= 0) {
			logMsg += ' Dealer is bankrupted!';
		}

		//Consolidated log message
		this.updateLog(logMsg);
		this.settleLastRound();

		if (winners.length > 0) {
			this.game.queue.push(
				`ROUNDOVER\t${JSON.stringify(winners)}\t${JSON.stringify([
					this.game.players[this.game.state.dealer - 1]
				])}`
			);
		}
		if (losers.length > 0) {
			this.game.queue.push(
				`ROUNDOVER\t${JSON.stringify([
					this.game.players[this.game.state.dealer - 1]
				])}\t${JSON.stringify(losers)}`
			);
		}

		if (this.settlement.length > 0) {
			this.overlay.show(
				`<div class="shim-notice">${dealerHTML}${playerHTML}</div>`,
				() => {
					this.restartQueue();
				}
			);
			return 0;
		} else {
			this.overlay.show(
				`<div class="shim-notice">${dealerHTML}${playerHTML}</div>`
			);
		}
		return 1;
	}

