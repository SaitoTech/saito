
	newRound() {

		//
		// advance and reset variables
		this.game.state.turn = 0;
		this.game.state.blackjack = 0;
		this.game.state.round++;
		//This is going to be a little problematic if removing people from the game
		this.game.state.dealer =
			(this.game.state.dealer % this.game.players.length) + 1;

		this.updateLog(
			`Round: ${this.game.state.round}, Dealer: P${
				this.game.state.dealer
			} (${this.game.state.player[this.game.state.dealer - 1].name})`
		);
		document.querySelectorAll('.plog').forEach((el) => {
			el.innerHTML = '';
		});

                for (let i = 0; i < this.game.state.player.length; i++) {
                        this.game.state.player[i].wager = 0;
                        this.game.state.player[i].payout = 1; //Multiplier for Blackjack bonus
                        this.game.state.player[i].hand = []; //Array for holding each players hand
                        this.game.state.player[i].total = 0; //Score of the hand
                        this.game.state.player[i].winner = null; //Is the player a winner this round
                        this.game.state.player[i].split = []; //An array for holding extra hands
                }
                this.game.queue = [];
                this.game.queue.push('startplay');
                this.updateHTML = '';

                //Show one card face up before players start taking turns
                for (let i = this.game.players.length; i > 0; i--)
                        this.game.queue.push(`showone\t${i}`); //Sets Data Structure so DisplayPlayer knows what cards to put in the DOM

                //Maybe should be in proper order, but it doesn't technically matter
                for (let i = this.game.players.length; i > 0; i--)
                        this.game.queue.push(`DEAL\t1\t${i}\t1`);

                this.game.queue.push('logbets');
                let betters = this.nonDealerPlayers();
                this.resetConfirmsNeeded(betters);
                this.game.queue.push('takebets\t' + JSON.stringify(betters));

                for (let i = this.game.players.length; i > 0; i--)
                        this.game.queue.push(`DEAL\t1\t${i}\t1`);

                for (let i = this.game.players.length; i > 0; i--)
                        this.game.queue.push(`DECKENCRYPT\t1\t${i}`);

                for (let i = this.game.players.length; i > 0; i--)
                        this.game.queue.push(`DECKXOR\t1\t${i}`);

                this.game.queue.push(
                        'DECK\t1\t' + JSON.stringify(this.returnPokerDeck())
                );

		return 1;
	}

	returnState(num_of_players) {
		let state = {};

		state.round = 0;
		state.turn = 0;
		state.dealer = 0;
		state.player = Array(num_of_players);
	        state.passed = Array(num_of_players);

		//state.player contains { name, credit | wager, payout, hand, total, winner}

		for (let i = 0; i < num_of_players; i++) {
			state.player[i] = {
				credit: this.game.stake,
				name: this.app.keychain.returnIdentifierByPublicKey(
					this.game.players[i],
					1
				),
				wager: 0,
				payout: 1,
				hand: [],
				total: 0,
				winner: null,
				split: []
			};
			if (state.player[i].name.indexOf('@') > 0) {
				state.player[i].name = state.player[i].name.substring(
					0,
					state.player[i].name.indexOf('@')
				);
			}
			if (state.player[i].name === this.game.players[i]) {
				state.player[i].name =
					this.game.players[i].substring(0, 10) + '...';
			}
		}

		return state;
	}

	removePlayerFromState(index) {
		this.game.state.player.splice(index, 1);
	}

	addPlayerToState(address) {
		let new_player = {
			credit: this.game.stake,
			name: this.app.keychain.returnIdentifierByPublicKey(address, 1),
			wager: 0,
			payout: 1,
			hand: [],
			total: 0,
			winner: null,
			split: []
		};

		if (new_player.name.indexOf('@') > 0) {
			new_player.name = new_player.name.substring(
				0,
				new_player.name.indexOf('@')
			);
		}
		if (new_player.name === address) {
			new_player.name = address.substring(0, 10) + '...';
		}
		this.game.state.player.push(new_player);
	}

