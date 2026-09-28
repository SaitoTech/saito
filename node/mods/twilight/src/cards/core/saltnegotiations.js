

    //
    // Salt Negotiations
    //
    if (card == "saltnegotiations") {

      // update defcon
      this.game.state.defcon += 2;
      if (this.game.state.defcon > 5) { this.game.state.defcon = 5; }
      this.updateDefcon();

      // affect coups
      this.game.state.events.saltnegotiations = 1;

      // otherwise sort through discards
      let discardlength = 0;
      for (var i in this.game.deck[0].discards) { discardlength++; }
      if (discardlength == 0) {
        this.updateLog("No cards in discard pile");
        return 1;
      }

      this.startClockAndSetActivePlayer(this.roles.indexOf(player));

      if (i_played_the_card) {

        // pick discarded card
        var twilight_self = this;

        let discard_deck = [];
        for (var i in this.game.deck[0].discards) {
        	// edge-case bug where scoring is not in scoring card (???)
        	try {
            if (this.game.deck[0].discards[i].scoring == 0) {
              if (this.game.state.events.shuttlediplomacy == 0 || (this.game.state.events.shuttlediplomacy == 1 && i != "shuttle")) {
                discard_deck.push(i);
                console.log(i);
                //html += '<li class="option" id="'+i+'">'+this.game.deck[0].discards[i].name+'</li>';
              }
            }
          } catch (err) {
        	  console.log("ERROR: please check scoring error in SALT for card: " + i);
          }
        }
 

    	let html = `
      	  <div class="transparent-card-overlay hide-scrollbar">
      	    ${this.returnCardList(discard_deck)}
      	  </div> 
    	`;
      
    	if (discard_deck.length == 0) {
	  salert("Salt Negotiations: no cards in discard pile...");
          twilight_self.addMove("resolve\tsaltnegotiations");
          twilight_self.endTurn();
	  return 0;
    	} 
    
   	let cc_status = this.overlay.clickToClose;
    	this.overlay.clickToClose = false;
        this.overlay.show(html, (card) => { 
	  this.overlay.clickToClose = cc_status;
        });
        setTimeout(() => {
	  document.querySelectorAll('.saito-overlay .transparent-card-overlay .card').forEach((el) => {
	    el.onclick = (e) => {
		let action2 = e.currentTarget.id;
		document.querySelectorAll('.saito-overlay .transparent-card-overlay .card').forEach((el) => { el.onclick = (e) => {}; });
	  	twilight_self.overlay.clickToClose = true;
		twilight_self.overlay.close();
        	twilight_self.hud.hideBackButton();
        	twilight_self.game.status = "Retrieving Card...";
        	twilight_self.hud.updateStatus(twilight_self.game.status);
        	twilight_self.hud.updateMenu([]);
        	twilight_self.hud.updateCards([]);
          	twilight_self.game.deck[0].hand.push(action2);
        	twilight_self.addMove("resolve\tsaltnegotiations");
          	twilight_self.addMove("NOTIFY\t"+player.toUpperCase() +" retrieved "+twilight_self.cardToText(action2));
          	twilight_self.addMove("undiscard\t"+action2); 
          	twilight_self.endTurn();
	    }
	  });
	}, 25);

/****
                twilight_self.game.status = "Choose Card to Reclaim:";
        twilight_self.hud.updateStatus(twilight_self.game.status);
        twilight_self.hud.updateMenu([]);
        twilight_self.hud.updateCards(discard_deck);
        twilight_self.cardbox.attachCardEvents();

        twilight_self.hud.attachControlCallback(function(action2) {
          twilight_self.game.deck[0].hand.push(action2);
          twilight_self.addMove("NOTIFY\t"+player.toUpperCase() +" retrieved "+twilight_self.cardToText(action2));
          twilight_self.addMove("undiscard\t"+action2); 
          twilight_self.endTurn();
        });
        twilight_self.bindBackButtonFunction(()=>{
          twilight_self.addMove("NOTIFY\t"+player.toUpperCase() +" does not retrieve card");
          twilight_self.endTurn();
        })
****/             

      }
     return 0;
    }


