
	async handleGameLoop() {
		///////////
		// QUEUE //
		///////////
		if (this.game.queue.length > 0) {
			//console.log(JSON.stringify(this.game.queue));
			let qe = this.game.queue.length - 1;
			let mv = this.game.queue[qe].split('\t');
			let shd_continue = 1;
			this.displayBoard();

			if (mv[0] === 'start' || mv[0] === 'newround') {
				//If we change the # of players, we want to stop the queue and refresh the game
				//Otherwise return 1, and run through the initialized queue commands
				return this.newRound();
			}

			if (mv[0] == 'checkplayers') {
				this.game.queue.splice(qe, 1);
				//How many players still have credit
				let removal = false;
				let solventPlayers = this.countActivePlayers();
				if (solventPlayers === 1) {
					//Clear winner
					this.game.queue.push(`winner\t${this.firstActivePlayer()}`);
					return 1;
				} else if (this.game.state.player.length > 2) {
					//if more than 2, remove extras
					for (
						let i = this.game.state.player.length - 1;
						i >= 0;
						i--
					) {
						if (this.game.state.player[i].credit <= 0) {
							removal = true;
							console.log(`*** Removing Player ${i + 1}`);
							this.removePlayer(this.game.players[i]); //Remove player in gamemodule
						}
					}
				}

				if (removal) {
					//Save game with fewer players
					this.saveGame(this.game.id);

					//Let's just try reloading the game
					setTimeout(() => {
						this.initialize_game_run = 0;
						this.initializeGameQueue(this.game.id);
					}, 1000);
					return 0;
				} else {
					return 1;
				}
			}

			//Player takes their turn
			if (mv[0] === 'play') {
				let player = parseInt(mv[1]);
				this.game.queue.splice(qe, 1);
				let status = null;
				$('.player-box.active').removeClass('active');
				this.playerbox.addClass('active', player);

				if (
					this.game.state.player[player - 1].wager == 0 &&
					player != this.game.state.dealer
				) {
					return 1;
				}

				//Blackjack
				if (
					this.game.state.player[player - 1].total === 21 &&
					this.game.state.player[player - 1].hand.length === 2
				) {
					this.game.queue.push(`blackjack\t${player}`);
					return 1;
				}
				//Bust
				if (this.game.state.player[player - 1].total < 0) {
					this.game.queue.push(`bust\t${player}`);
					return 1;
				}

				//Default turn behavior
				if (player == this.game.player) {
					this.playerTurn();
				} else {
					this.updateStatus(
						this.getLastNotice(true) +
							`<div>Waiting for ${
								player === this.game.state.dealer
									? 'the dealer'
									: `Player ${player}`
							} (${
								this.game.state.player[player - 1].name
							})</div>`
					);
				}
				return 0;
			}

			if (mv[0] === 'hit') {
				let player = parseInt(mv[1]);
				let playerName =
					player == this.game.state.dealer
						? 'Dealer'
						: `Player ${player}`;
				this.updateLog(
					`${playerName} hits on ${
						this.game.state.player[player - 1].total
					}`
				);
				this.game.queue.splice(qe, 1);
				this.game.queue.push('play\t' + player);
				this.game.queue.push('revealhand\t' + player); //force reveal whole hand
				this.game.queue.push('DEAL\t1\t' + player + '\t1');
				return 1;
			}

			if (mv[0] === 'double') {
				let player = parseInt(mv[1]);
				this.game.queue.splice(qe, 1);
				this.updateLog(`Player ${player} doubles down`);
				this.game.state.player[player - 1].wager =
					2 * this.game.state.player[player - 1].wager;
				this.game.queue.push('checkdouble\t' + player);
				this.game.queue.push('revealhand\t' + player);
				this.game.queue.push('DEAL\t1\t' + player + '\t1');
				return 1;
			}

			if (mv[0] === 'split') {
				let player = parseInt(mv[1]);
				//Store second card in reserve
				let card = this.game.state.player[player - 1].hand.splice(1);
				this.game.state.player[player - 1].split.push(card);
				this.updateLog(`Player ${player} splits their hand`);
				this.game.queue.splice(qe, 1);

				this.game.queue.push(
					`playsplit\t${player}\t${
						this.game.state.player[player - 1].wager
					}`
				); //switch to second card
				//Play first card as a hand
				this.game.queue.push('play\t' + player);
				this.game.queue.push('revealhand\t' + player);
				this.game.queue.push('DEAL\t1\t' + player + '\t1');
				return 1;
			}

			//TODO: double check that this works in all conditions both hands play through to the end, and one or the other busts out/gets dealt a blackjack
			if (mv[0] === 'playsplit') {
				let player = parseInt(mv[1]);
				this.game.state.player[player - 1].wager = parseFloat(mv[2]); //Restore original wager
				this.game.queue.splice(qe, 1);
				//Swap the hands
				let newHand = this.game.state.player[player - 1].split.pop();
				this.game.state.player[player - 1].split.unshift(
					this.game.state.player[player - 1].hand
				);
				this.game.state.player[player - 1].hand = newHand;
				//Play next card as a hand
				this.game.queue.push('play\t' + player);
				this.game.queue.push('revealhand\t' + player);
				this.game.queue.push('DEAL\t1\t' + player + '\t1');
				return 1;
			}

			if (mv[0] === 'checkdouble') {
				let player = parseInt(mv[1]);
				this.game.queue.splice(qe, 1);
				//Check for Bust
				if (this.game.state.player[player - 1].total < 0) {
					this.game.queue.push(`bust\t${player}`);
				} else {
					this.updateLog(
						`Player ${player} ends up with ${
							this.game.state.player[player - 1].total
						}`
					);
				}
				return 1;
			}

			if (mv[0] === 'setwager') {
				//Move data into shared public data structure
				this.game.queue.splice(qe, 1);
				let player = parseInt(mv[1]);
				let wager = parseFloat(mv[2]);
				this.game.state.player[player - 1].wager = wager;
				return 1;
			}
			//Player Blackjack
			if (mv[0] === 'blackjack') {
				this.game.queue.splice(qe, 1);
				let player = parseInt(mv[1]);
				//this.game.state.player[player-1].payout = 2; //Temporary Blackjack bonus
				//Pay out immediately
				let wager = this.game.state.player[player - 1].wager;
				this.game.state.player[player - 1].credit += wager * 2;
				this.game.state.player[this.game.state.dealer - 1].wager -=
					wager * 2;
				this.game.state.player[player - 1].wager = 0;
				if (player == this.game.player) {
					this.updateStatus(
						`<div class="persistent">Blackjack! You win double your bet (${wager}x2)</div>`
					);
				}

				this.updateHTML += `<div class="h3 justify"><span>${
					this.game.state.player[player - 1].name
				}: Blackjack!</span><span>Win:${wager * 2}</span></div>`;
				this.updateHTML += this.handToHTML(
					this.game.state.player[player - 1].hand
				);

				if (this.game.crypto) {
					let ts = new Date().getTime();
					this.rollDice();
					let uh = this.game.dice;
					this.game.queue.push(
						`SEND\t${
							this.game.players[this.game.state.dealer - 1]
						}\t${this.game.players[player - 1]}\t${(
							wager * 2
						).toFixed(this.decimal_precision)}\t${ts}\t${uh}\t${
							this.game.crypto
						}`
					);
				}

				this.updateLog(`Player ${player} has a blackjack!`);
				return 1;
			}

			if (mv[0] === 'stand') {
				this.game.queue.splice(qe, 1);
				let playerName =
					mv[1] == this.game.state.dealer
						? 'Dealer'
						: `Player ${mv[1]}`;
				this.updateLog(
					`${playerName} stands on ${
						this.game.state.player[mv[1] - 1].total
					}`
				);
				return 1;
			}

			if (mv[0] === 'bust') {
				this.game.queue.splice(qe, 1);
				let player = parseInt(mv[1]);

				if (player != this.game.state.dealer) {
					//Player, not dealer
					let wager = this.game.state.player[player - 1].wager;
					this.updateLog(
						`Player ${player} busts, loses ${wager} to dealer`
					);
					//Collect their chips immediately
					this.game.state.player[player - 1].credit -= wager;
					this.game.state.player[this.game.state.dealer - 1].wager +=
						wager;
					this.game.state.player[player - 1].wager = 0;
					if (player == this.game.player) {
						this.updateStatus(
							`<div class="persistent">You have gone bust. You lose your bet of ${wager}</div>`
						);
					}

					this.updateHTML += `<div class="h3 justify"><span>${
						this.game.state.player[player - 1].name
					}: Bust!</span><span>Loss:${wager}</span></div>`;
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
				} else {
					this.updateLog(`Dealer busts`);
				}
				return 1;
			}

			if (mv[0] === 'logbets') {
				this.game.queue.splice(qe, 1);
				let logMsg = '';
				for (let i = 0; i < this.game.players.length; i++) {
					if (i + 1 !== this.game.state.dealer) {
						logMsg += `Player ${i + 1} bets ${
							this.game.state.player[i].wager
						}; `;
					}
				}
				logMsg = logMsg.substr(0, logMsg.length - 2);
				this.updateLog(logMsg);
				return 1;
			}

			if (mv[0] === 'takebets') {
				let betters = JSON.parse(mv[1]);
				let betsNeeded = 0;
				let doINeedToBet = false;
				let statusMsg = '';
				$('.player-box.active').removeClass('active');
				for (let i of betters) {
					if (this.game.confirms_needed[i - 1] == 1) {
						this.playerbox.addClass('active', i);
						statusMsg += `Player ${i}, `;
						betsNeeded++;
						if (this.game.player == parseInt(i)) {
							//If >2 players, this gets called repeatedly....
							this.addMove('RESOLVE\t' + this.publicKey);
							this.selectWager();
							doINeedToBet = true;
						}
					}
				}

				statusMsg = statusMsg.substring(0, statusMsg.length - 2); //cut the final ,
				if (betsNeeded >= 2) {
					let index = statusMsg.lastIndexOf(',');
					statusMsg =
						statusMsg.slice(0, index) +
						' and' +
						statusMsg.slice(index + 1);
				}

				if (!doINeedToBet) {
					this.updateStatus(
						`Waiting for ${statusMsg} to place their bets.`
					);
				}

				if (betsNeeded == 0) {
					this.game.queue.splice(qe, 1);
					return 1;
				}
				return 0;
			}

			//Check if Dealer has blackjack
			if (mv[0] === 'dealer') {
				this.game.queue.splice(qe, 1);
				//Am I the dealer
				if (this.game.state.dealer == this.game.player) {
					//check for dealer blackjack, this is private info
					let score = this.scoreArrayOfCards(this.myCards());
					if (score == 21) {
						this.addMove('announceblackjack');
					}
					this.endTurn();
				} else {
					this.updateStatus('Waiting for dealer');
				}
				return 0;
			}

			//Dealer Blackjack
			if (mv[0] === 'announceblackjack') {
				this.game.state.blackjack = 1;
				//Clear Game queue
				this.game.queue = [];
				//Go to winnings collection
				this.game.queue.push('pickwinner');
				//Show all hands
				for (let i = 1; i <= this.game.players.length; i++) {
					this.game.queue.push(`revealhand\t${i}`);
				}

				return 1;
			}


			if (mv[0] === 'startplay') {

				//Arrange the queue for players to take turns
				this.game.queue.splice(qe, 1);

				this.game.queue.push('pickwinner');
				let otherPlayers = [];

				//Dealer Goes Last
				this.game.queue.push('play\t' + this.game.state.dealer);
				this.game.queue.push(`revealhand\t${this.game.state.dealer}`);

				//Cycle Other Players (in order from dealer)
				for (let i = 0; i < this.game.players.length - 1; i++) {
					let otherPlayer =
						((this.game.state.dealer + i) %
							this.game.players.length) +
						1;
					this.game.queue.push('play\t' + otherPlayer);
					this.game.queue.push(`revealhand\t${otherPlayer}`);
				}
				this.game.queue.push(`dealer`);

				return 1;
			}

			//Share information of the first card in your hand
			if (mv[0] === 'showone') {
				let player = parseInt(mv[1]);
				this.game.queue.splice(qe, 1);
				if (player === this.game.player) {
					let card =
						this.game.deck[0].cards[this.game.deck[0].hand[0]].name; //Just One Card
					this.addMove(
						'flipcard\t' + this.game.player + '\t' + [card]
					);
					this.endTurn();
				}
				return 0;
			}

			//Announces the last (most recent) card in the player's hand
			if (mv[0] === 'revealhand') {
				this.game.queue.splice(qe, 1);
				if (this.game.player == parseInt(mv[1])) {
					//Only share if it is my turn
					let card =
						this.game.deck[0].hand[
							this.game.deck[0].hand.length - 1
						];
					this.addMove(
						'flipcard\t' +
							this.game.player +
							'\t' +
							this.game.deck[0].cards[card].name
					);
					this.endTurn();
				}
				return 0;
			}

			/*
      Given array of D1, S6, etc cards, every now knows the whole hand and its score
      */
			if (mv[0] === 'flipcard') {
				let player = parseInt(mv[1]);
				this.game.queue.splice(qe, 1);

				this.game.state.player[player - 1].hand.push(mv[2]);
				this.game.state.player[player - 1].total =
					this.scoreArrayOfCards(
						this.game.state.player[player - 1].hand
					);
				return 1;
			}

			if (mv[0] === 'pickwinner') {
				this.game.queue.splice(qe, 1);
				return this.pickWinner();
			}

			if (mv[0] === 'winner') {
				//copied from poker
				this.game.queue = [];
				this.game.crypto = null; //Clear crypto to prevent double dipping
				//Notably not keyed to game.player, but by the index
				if (this.game.player == parseInt(mv[1]) + 1) {
					this.sendGameOverTransaction(this.publicKey, 'elimination');
				}
				return 0;
			}

			//
			// avoid infinite loops
			//
			if (shd_continue == 0) {
				console.warn('NOT CONTINUING');
				return 0;
			}
		}
		return 1;
	}

