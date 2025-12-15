
	async handleGameLoop() {

  	  ///////////
	  // QUEUE //
	  ///////////
	  if (this.game.queue.length > 0) {

	    let qe = this.game.queue.length - 1;
	    let mv = this.game.queue[qe].split("\t");

	    console.log("QUEUE: " + JSON.stringify(this.game.queue));

	    //
	    // we never clear the "round" so that when we hit it
	    // we always bounce back higher on the queue by adding
	    // more turns for each player.
	    //
	    if (mv[0] == "round") {
	      this.game.queue.push("play\t2");
	      this.game.queue.push("DEAL\t2\t2\t1");
	      this.game.queue.push("new_turn\t2");
	      this.game.queue.push("play\t1");
	      this.game.queue.push("DEAL\t1\t1\t1");
	      this.game.queue.push("new_turn\t1");
	    }

	    //
	    // 
	    //
	    if (mv[0] === "discard") {

	      this.game.queue.splice(qe, 1);

	      let player = parseInt(mv[1]);
	      let card = mv[2];

	      if (this.game.player == player) {
		for (let z = this.game.deck[this.game.player-1].hand.length-1; z >= 0; z--) {
		  if (this.game.deck[this.game.player-1].hand[z] === card) {
		    this.game.deck[this.game.player-1].hand.splice(z, 1);
		    this.game.deck[this.game.player-1].discards[card] = 1;;
		  }
		}
	      }

	      return 1;

	    }

	    //
	    // "tap"
	    //
	    if (mv[0] == "tap") {

	      this.game.queue.splice(qe, 1);
	
	      let player = parseInt(mv[1]);
	      let key = mv[2];
	      let p = this.game.state.players_info[player-1];

	      for (let z = 0; z < p.cards.length; z++) {
		if (p.cards[z].key === key) {
		  p.cards[z].tapped = 1;
		}
	      }

	      return 1;
	    }

	    //
	    // "spend"
	    //
	    // spends mana automatically if the player has the proper colours, or kicks up 
	    // an overlay that lets them manually select which cards to use to pay the 
	    // associated costs.
	    //
	    if (mv[0] == "spend") {

	      this.game.queue.splice(qe, 1);

	      let player = parseInt(mv[1]);
	      let type = mv[2];
	      let cost = JSON.parse(mv[3]);

	      if (this.game.player == player) {
	        this.board.lands_overlay.renderAndPayCost(cost);
	      }

	      return 0;
	    }


	    //
	    // attack
	    //
	    // a set of selected creatures attacks another player
	    //
	    if (mv[0] == "attack") {

	      this.game.queue.splice(qe, 1);

	      let attacker = parseInt(mv[1]);
	      let selected = JSON.parse(mv[2]);

	      if (this.game.player == attacker) {
	        this.attack_overlay.render(selected);
	      } else {
	        this.attack_overlay.renderAndAssignDefenders(selected);
	      }

	      alert("creatures attack...");

	      return 1;

	    }


	    //
	    // this "deploys" cards into the battleground, such
	    // as adding mana into play. the 4th argument allows us
	    // to specify that a player should ignore the instruction
	    // which is used when a player has made their move locally
	    // and we have already updated their board and do not want
	    // them to repeat that.
	    // 
	    if (mv[0] == "deploy") {

	      this.game.queue.splice(qe, 1);

	      let type = mv[1];
	      let player = parseInt(mv[2]);
	      let cardkey = mv[3];
	      let card = this.deck[cardkey];
	      let player_ignores = parseInt(mv[4]);

	      if (this.game.player != player_ignores) {

		if (type == "land") {
		  this.deploy(player, cardkey);
		  this.board.refreshPlayerMana(player);
		}
			
		if (type == "creature") {
		  this.deploy(player, cardkey);
		}
				
		if (type == "artifact") {
		  this.deploy(player, cardkey);
		}
				
		if (type == "sorcery") {
		  this.deploy(player, cardkey);
		}

	      }

   	      this.board.render();			

	      return 1;

	    }

	    if (mv[0] === "new_turn") {

	      let player = parseInt(mv[1]);
	      this.onNewTurn(player);

	      this.board.refreshPlayerMana(player);
	      this.board.render();

              this.game.queue.splice(qe, 1);
	      return 1;

	    }

	    if (mv[0] === "play") {

	      let player = parseInt(mv[1]);

   	      if (this.game.player == player) {
		this.board.render();
		this.playerTurn();
	      } else {
	        this.updateStatusAndListCards("Opponent Turn", this.game.deck[this.game.player-1].hand);
	      }

	      return 0;

	    }


          
	    if (mv[0] === "insert_before_counter_or_acknowledge") {
          
              this.game.queue.splice(qe, 1);
    
              let insert = "";
              for (let i = 1; i < mv.length; i++) { 
                if (i > 1) { insert += "\t"; }
                insert += mv[i];
              }
              for (let i = this.game.queue.length-1; i >= 0; i--) {
                let lqe = this.game.queue[i];
                let lmv = lqe.split("\t");
                if (lmv[0] === "HALTED" || lmv[0] === "counter_or_acknowledge") {
                  this.game.queue.splice(i, 0, insert);
                  i = 0;
                }
              } 
              return 1;

            }




          
        if (mv[0] === "counter_or_acknowledge") {
          
	  let realms_self = this;
          let my_specific_game_id = this.game.id;


          //
          // 
          //
          this.unbindBackButtonFunction();
          
          //
          // hide any cardbox 
          //
          this.cardbox.hide();

          //
          // if i have already confirmed, we only splice and pass-through if everyone else has confirmed
          // otherwise we will set ack to 0 and return 0 which halts execution. so we should never clear
          // splice anything out except here...
          //
          let have_i_resolved = false;
          if (this.game.confirms_needed[this.game.player-1] == 0) {
            have_i_resolved = true;
          } else {
            if (this.game.tmp_confirm_sent == 1) {
              have_i_resolved = true;
            } else {
              if (await this.hasMyResolvePending()) {
                have_i_resolved = true;
              }
            }
          }


          //
          //
          //
          let unresolved_players = [];
          if (have_i_resolved == true) {

            let ack = 1;

            for (let i = 0; i < this.game.confirms_needed.length; i++) {
              if (this.game.confirms_needed[i] >= 1) {
                unresolved_players.push(this.game.players[i]);
                ack = 0;
              }
            }

            //
            // if everyone has returned, splice out counter_or_acknowledge
            // and continue to the next move on the game queue
            //
            if (ack == 1) {
              this.game.queue.splice(qe, 1);
            }

            this.updateStatus("acknowledged");
            return ack;
          }


          //
          // if we get this far i have not confirmed and others may or may
          // not have confirmed, but we want at least to check to see wheter
          // i want to just click ACKNOWLEDGE or take an action that might
          // affect future gameplay (such as playing a card)....
          //
          let msg = mv[1];
          let stage = "";
          if (mv[2]) { stage = mv[2]; }
          let extra = "";
          if (mv[3]) { extra = mv[3]; }

          //
          // this is run when players have the opportunity to counter
          // or intercede in a move made by another player. we cannot
          // automatically handle without leaking information about
          // game state, so we let players determine themselves how to
          // handle. if they are able to, they can respond. if not they
          // click acknowledge and the msg counts as notification of an
          // important game development.
          //
          let html = '<ul>';
          let menu_index = [];
          let menu_triggers = [];
          let attach_menu_events = 0;

          html += '<li class="option" id="ok">acknowledge</li>';

          let z = this.returnEventObjects();
          for (let i = 0; i < z.length; i++) {

            //
            // maybe event has been removed, will fail
            //
            try {

              if (z[i].key !== this.game.state.active_card) {
                if (z[i].menuOptionTriggers(this, stage, this.game.player, extra) == 1) {
                  let x = z[i].menuOption(this, stage, this.game.player, extra);
                  if (x.html) {
                    html += x.html;
                    z[i].faction = x.faction;
                    menu_index.push(i);
                    menu_triggers.push(x.event);
                    attach_menu_events = 1;
                  }
                }
              }

            } catch (err) {
              console.log("caught error looking for event: " + JSON.stringify(err));
            }


          }
          html += '</ul>';

          //
          // skipping, and no options for active player -- skip completely
          //
          if (this.game.state.skip_counter_or_acknowledge == 1) {
            if (attach_menu_events == 0) {
              realms_self.game.tmp_confirm_sent = 1;
              realms_self.game.confirms_needed[realms_self.game.player-1] = 1;
              realms_self.addMove("RESOLVE\t"+realms_self.publicKey);
              realms_self.endTurn();
              realms_self.updateStatus("skipping acknowledge...");
              return 0;
            }
          }

          //
          // in faster_play mode, we will switch to HALTED if there are
          // no other options. this halts OUR game but allows others to continue
          // to play more rapidly, which helps speed-up games where network connections
          // can be a little slow, at the cost of leaking a small amount of information
          // about player hands from the speed of the response (i.e. a fast response
          // likely means an automatic response, which likely means no cards permitting
          // intervention are in-hand.
          //
          if (this.faster_play == 1 && menu_index.length == 0 && attach_menu_events != 1 && this.isGameHalted() != 1) {

            //
            // we don't need to HALT the game because the game will not progress
            // until all players have hit RESOLVE anyway.
            //
            realms_self.halted = 1;
            realms_self.game.queue[realms_self.game.queue.length-1] = "HALTED\tWaiting for Game to Continue\t"+realms_self.publicKey;
            realms_self.hud.back_button = false;

            let html = '<ul><li class="option" id="ok">acknowledge</li></ul>';
            realms_self.updateStatusWithOptions(msg, html);

            $('.option').off();
            $('.option').on('click', function () {

              $('.option').off();
              let action = $(this).attr("id");

              if (realms_self.game.id != my_specific_game_id) {
                realms_self.game = realms_self.loadGame(my_specific_game_id);
              }

              // tell game engine we can move
              realms_self.halted = 0;
              realms_self.gaming_active = 0;

              realms_self.updateStatus('continuing...');

              //
              // our own move will have been ticked into the future queue, along with
              // anyone else's so we skip restartQueue() which will freeze if it sees
              // that we have moves still pending, but should clear if it now finds
              // UNHALT is the latest instruction and this resolve is coming from us!
              //
                //
                // debugging -- maybe my move has arrived
                //
              setTimeout(() => { realms_self.processFutureMoves(); }, 5);

            });

            realms_self.game.tmp_confirm_sent = 1;
            realms_self.addMove("RESOLVE\t"+realms_self.publicKey);
            realms_self.endTurn();

            return 0;

          }

          this.updateStatusWithOptions(msg, html);
          let deck = realms_self.returnDeck(true);

          //
          // this removes other options like Foul Weather after N seconds, so that
          // the game is not significantly slowed if a player refuses to take action.
          //

          if (this.isGameHalted() != 1) {

          //
          // prevent double broadcast if we run a second time and reach here
          //
          clearTimeout(counter_or_acknowledge_inactivity_timeout);
          true_if_counter_or_acknowledge_cleared = false;
          counter_or_acknowledge_inactivity_timeout = setTimeout(() => {

            if (true_if_counter_or_acknowledge_cleared) {
              //alert("in auto-sending timer, but true if counter or acknowledge cleared is true!");
              clearTimeout(counter_or_acknowledge_inactivity_timeout);
              return 0;
            }

            realms_self.cardbox.hide();

            realms_self.halted = 1;
            realms_self.hud.back_button = false;

            let html = '<ul><li class="option acknowledge" id="ok">acknowledge</li></ul>';
            realms_self.updateStatusWithOptions(msg, html);

            $('.option').off();
            $('.option').on('click', function () {

                    true_if_counter_or_acknowledge_cleared = true;

                    $('.option').off();

                    realms_self.updateStatus("continuing...");

                    let action = $(this).attr("id");

                    setTimeout(() => {

                            if (realms_self.game.id != my_specific_game_id) {
                              realms_self.game = realms_self.loadGame(my_specific_game_id);
                            }

                            // tell game engine we can move
                            realms_self.halted = 0;
                            realms_self.gaming_active = 0;

                            //
                            // our own move will have been ticked into the future queue, along with
                            // anyone else's so we skip restartQueue() which will freeze if it sees
                            // that we have moves still pending, but should clear if it now finds
                            // UNHALT is the latest instruction and this resolve is coming from us!
                            //
                            realms_self.processFutureMoves();

                    }, 5);
            });

            realms_self.game.tmp_confirm_sent = 1;
            realms_self.addMove("RESOLVE\t"+realms_self.publicKey);
            realms_self.endTurn();
            return 0;

          }, 7500);
          }

          $('.option').off();
          $('.option').on('mouseover', function() {

            //
            // mark that we have interacted
            //
            true_if_counter_or_acknowledge_cleared = true;
            clearTimeout(counter_or_acknowledge_inactivity_timeout);

            document.querySelectorAll(".blink").forEach((el) => {
              el.classList.remove("blink");
            });

            let action2 = $(this).attr("id");
            if (deck[action2]) {
              realms_self.cardbox.show(action2);
              return;
            }
            if (realms_self.game.deck[0].cards[action2]) {
              realms_self.cardbox.show(action2);
              return;
            }
          });
          $('.option').on('mouseout', function() {

            //
            // mark that we have interacted
            //
            true_if_counter_or_acknowledge_cleared = true;
            clearTimeout(counter_or_acknowledge_inactivity_timeout);

            let action2 = $(this).attr("id");
            if (deck[action2]) {
              realms_self.cardbox.hide(action2);
            }
            if (realms_self.game.deck[0].cards[action2]) {
              realms_self.cardbox.hide(action2);
            }
          });
          $('.option').on('click', async function () {

            //
            // mark that we have interacted
            //
            true_if_counter_or_acknowledge_cleared = true;
            clearTimeout(counter_or_acknowledge_inactivity_timeout);

            let action2 = $(this).attr("id");

            //
            // prevent blocking
            //
            realms_self.cardbox.hide();

            //
            // events in play
            //
            if (attach_menu_events == 1) {
              for (let i = 0; i < menu_triggers.length; i++) {
                if (action2 == menu_triggers[i]) {
                  $(this).remove();
                  realms_self.updateStatus("acknowledged...");
                  if (realms_self.game.confirms_needed[realms_self.game.player-1] == 1) {
                    realms_self.prependMove("RESOLVE\t"+realms_self.publicKey);
                    z[menu_index[i]].menuOptionActivated(realms_self, stage, realms_self.game.player, z[menu_index[i]].faction);
                  }
                  return 0;
                }
              }
            }

            if (action2 == "ok") {

              //
              // make sure we are not halted
              //
              realms_self.halted = 0;

              //
              // this ensures we clear regardless of choice
              //
              // manually add, to avoid re-processing
              if (realms_self.game.confirms_needed[realms_self.game.player-1] == 1) {
                realms_self.prependMove("RESOLVE\t"+realms_self.publicKey);
                realms_self.updateStatus("acknowledged");
                realms_self.endTurn();
              }
              return 0;
            }

          });

          return 0;

        }








	  }
	  return 1;
	}

