
	onNewTurn(player_num=0) {

		let p = this.game.state.players_info[player_num-1];

		p.land_played = 0;
		p.combat_started = 0;
		p.combat_finished = 0;

		for (let z = 0; z < p.cards.length; z++) { p.cards[z].tapped = 0; }

		this.board.refreshPlayerMana(player_num);
		this.board.render();

	}


	returnState() {

		let state = {};
		state.players_info = [2];
		for (let i = 0; i < 2; i++) {
			state.players_info[i] = {
				health: 20,
				mana: 0, 
				land_played: 0, 
				combat_started: 0, 
				combat_finished: 0, 
				cards: [],
				graveyard: [],
			};
		}

		state.turn = 1;

		return state;
	}


	returnEventObjects() {

    		let z = [];

    		//
    		// cards in the deck can modify gameloop
    		//
    		for (let key in this.deck) {
    		  z.push(this.deck[key]);
    		} 

		return z;
	}


	deploy(player, cardname) {

	  let c = this.deck[cardname];

	  let obj = {
	    key    	: cardname ,
	    tapped 	: 1 ,
            affixed 	: [] ,
	  }

	  this.game.state.players_info[player-1].cards.push(obj);
	  this.board.render();

	}

	

