/**********************************************************************************

 GAME MODULE v.2

 This is a general parent class for modules that wish to implement Game logic. It
 introduces underlying methods for creating games via email invitations, and sending
 and receiving game messages over the Saito network. The module also includes random
 number routines for dice and deck management.

 This module attempts to use peer-to-peer connections with fellow gamers where
 possible in order to avoid the delays associated with on-chain transactions. All
 games should be able to fallback to using on-chain communications however. Peer-
 to-peer connections will only be used if both players have a proxymod connection
 established.a

 Developers please note that every interaction with a random dice and or processing
 of the deck requires an exchange between machines, so games that do not have more
 than one random dice roll per move and/or do not require constant dealing of cards
 from a deck are easier to implement on a blockchain than those which require
 multiple random moves per turn.

 HOW IT WORKS

 We recommend new developers check out the WORDBLOCKS game for a quick introduction
 to how to build complex games atop the Saito Game Engine. Essentially, games require
 developers to manage a "stack" of instructions which are removed one-by-one from
 the main stack, updating the state of all players in the process.

**********************************************************************************/

var saito = require('../saito/saito');
var ModTemplate = require('./template');
var util = require('util');
const Big      = require('big.js');

//////////////////
// CONSTRUCTOR  //
//////////////////
function Game(app) {

  if (!(this instanceof Game)) { return new Game(app); }

  Game.super_.call(this);

  this.app = app;

  this.name = "Game";
  this.browser_active = 0;
  this.emailAppName = "Game";
  this.useHUD = 0;
  this.addHUDMenu = [];

  //
  // sanity check
  //
  this.not_so_secret = "WE_HAVE_TO_GO_DEEPER";

  this.connection_monitor_timer = null;
  this.connection_monitor_speed = 3500;

  this.offchain = 1;

  this.gameboardWidth = 5100;
  this.screenRatio = 1;

  this.low_balance_alert_sent = 0;
  this.initialize_game_run = 0;

  this.game = {};

  this.old_discards = {};
  this.old_removed = {};
  this.old_cards = {};
  this.old_crypt = [];
  this.old_keys = [];
  this.old_hand = [];


  return this;

}
module.exports = Game;
util.inherits(Game, ModTemplate);






////////////////////
// initializeHTML //
////////////////////
Game.prototype.attachEvents = function attachEvents(app) {

  $('.status').show();
  $('.log').show();
  $('.hud_menu_overlay').hide();

  $('document').tooltip();

  $('.menu-dropdown').off()
  $('.menu-dropdown').on('click', () => {
    // $('.menu-dropdown-icon').toggle();
    $('.menu-dropdown-box').css("height", "0px")
    $('.menu-dropdown-box').toggle();
    $('.menu-dropdown-box').animate({height: '200px'});
  });

  $('#game_status').off();
  $('#game_status').on('click', () => {
    $('.hud_menu_overlay').hide();
    $('.status').show();
  })

  /*
  $('#game_log').off();
  $('#game_log').on('click', () => {
    $('.hud_menu_overlay').hide();
    //$('.status').hide();
    $('.log').show();
    $('#game_log').removeClass('loading');
    $('#game_log').removeClass('loaded');
    $('#game_log').css('background-color', '');
  })
  */

  //
  // user-added HUD menus
  //
  for (let i = 0; i < this.addHUDMenu.length; i++) {
    let divname = '#game_' + this.addHUDMenu[i].toLowerCase();
    $(divname).off();
    $(divname).on('click', () => {
      this.triggerHUDMenu(this.addHUDMenu[i].toLowerCase());
      $('.status').hide();
      $('.hud_menu_overlay').show();
    });
  }

  $("#homer").on("click", function() {
    $("#hud").css("left", "");
    $("#hud").css("top", "");
    $("#homer").removeClass("fa-window-maximize");
    $("#pin").show();
  });

  $('#controls #sizer').off();
  $('#controls #sizer').on('click', () => {
    $("#hud").toggleClass("tall short");
    $("#sizer").toggleClass("fa-caret-up fa-caret-down");
  });

  $("#hud").draggable({
    scroll: true,
    start: function (event, ui) {
      var left = parseInt($(this).css('left'),10);
      left = isNaN(left) ? 0 : left;
      var top = parseInt($(this).css('top'),10);
      top = isNaN(top) ? 0 : top;
      recoupLeft = left - ui.position.left;
      recoupTop = top - ui.position.top;
  },
    drag: function (event, ui) {
      ui.position.left += recoupLeft;
      ui.position.top += recoupTop;
  },
    stop: function() {
      $("#homer").addClass("fa-window-maximize");
      $("#pin").hide();
    }
  });

  $("#hud").on("mouseenter", function() {
    if ($("#pin").hasClass("fa-arrows-v")) {
      if ($("#homer").hasClass("fa-window-maximize")) {
        return;
      } else {
        if ($("#sizer").hasClass("fa-caret-up")) {
          setTimeout( function(){ $("#sizer").click(); }, 333);
        }
      }
    }
  });
  
  $("#hud").on("mouseleave", function() {
    if ($("#pin").hasClass("fa-arrows-v")) {
      if ($("#homer").hasClass("fa-window-maximize")) {
        return;
      } else {
        if ($("#sizer").hasClass("fa-caret-down")) {
          setTimeout( function() { $("#sizer").click(); }, 333);
        }
      }
    }
  });


  $("#pin").on("click", function() {
    $("#pin").toggleClass("fa-thumb-tack fa-arrows-v");
  });

  
  
  $("#zoomdown").on("click", function() {
      $( ".gameboard" ).css("zoom", ($( ".gameboard" ).css("zoom")/1.1) );
  });
  
  $("#zoomup").on("click", function() {
      $( ".gameboard" ).css("zoom", ($( ".gameboard" ).css("zoom")/0.95) );
  });

  if ($(window).outerHeight() < 800) {
      $("#sizer").click();
      $( ".gameboard" ).css("zoom", 0.67);
    } else {
      $("#pin").click();
      $( ".gameboard" ).css("zoom", 0.6);
  }

}


Game.prototype.initializeHTML = function initializeHTML(app) {

  if (this.browser_active == 0) { return; }
  if (this.useHUD == 0) { return; }

  //
  // insert HUD
  //

  // <div class="hud-clickable">
  //  <i class="fa fa-caret-down" id="dropdown-button" style="cursor: pointer"></i>
  // </div>
  // <nav id="menu" class="menu">

  let html = `
    <div id="hud" class="hud tall">
      <div id="dragbar" class="hud-clickable dragbar dragbar-default" title="Drag me">
        <div id="controls" class="controls">
          <span id="sizer" title="Expand/Collapse Controls" class="fa fa-caret-down hud-button"></span>
          <span id="controls-left" class="controls-left">
            <span id="zoomup" title="Board - Zoom In" class="fa fa-plus-circle zoombutton zoomup hud-button"></span>
            <span id="zoomdown" title="Board - Zoom Out" class="fa fa-minus-circle zoombutton zoomdown hud-button"></span>          
            <span id="homer" title="Lock to bottom" class="fa hud-button"></span>
            <span id="pin" title="Allow or Lock Auto-expand" class="fa fa-arrows-v hud-button"></span>
          </span>
        </div>
      </div>
      <div id="zoombar" class="zoombar">
        <!--div id="zoomup" title="Zoom in on Board" class="fa fa-plus-circle zoombutton zoomup"></div>
        <div id="boardzoom" class="fa fa-map zoombutton"></div>
        <div id="zoomdown" title="Zoom out on Board" class="fa fa-minus-circle zoombutton zoomdown"></div-->
      </div>
      <nav class="hud-header">
        <ul>
          <li>
	          <a id="game_status">Status</a>
	       </li>`;

          for (let i = 0; i < this.addHUDMenu.length; i++) {
            html += `
              <li>
                <a id="game_${this.addHUDMenu[i].toLowerCase()}">${this.addHUDMenu[i]}</a>
              </li>
            `;
          }

      html += `
        </ul>
      </nav>
        <div class="status" id="status"></div>
        <div id="hud_menu_overlay" class="hud_menu_overlay"></div>
        <div class="log" id="log"></div>
    </div>
  `;
 
  $('.gameboard').after(html);
}




//
// inherited and overwritten by games that add items to the HUD menu
//
Game.prototype.triggerHUDMenu = function triggerHUDMenu(menuname) {}





////////////////////
// onConfirmation //
////////////////////
Game.prototype.onConfirmation = async function onConfirmation(blk, tx, conf, app) {

  if (conf == 0) {

    let txmsg      = tx.returnMessage();
    let game_self  = app.modules.returnModule(txmsg.module);

    clearInterval(game_self.connection_monitor_timer);
    game_self.flagConnectionStable();


//    try {

      if (tx.isTo(app.wallet.returnPublicKey()) == 1) {

        /////////////////////////
        // check SAITO balance //
        /////////////////////////
        if (game_self.low_balance_alert_sent == 0 && Big(app.wallet.returnBalance()).lt(80)) {
          if (game_self.browser_active == 1) { alert("Your SAITO balance ("+app.wallet.returnBalance()+") is running low. Your game may act unpredictably if you run out of tokens"); }
          game_self.updateLog("Your SAITO balance ("+app.wallet.returnBalance()+") is running low. Please visit the <a href='/faucet' target='_faucet'>token faucet</a> to refill your account. Remember not to leave your game mid-turn.</a>'");
          game_self.low_balance_alert_sent = 1;
        }

        ////////////
        // INVITE //
        ////////////
        if (txmsg.request === "invite") {

	  //
          if (tx.transaction.from[0].add === app.wallet.returnPublicKey()) { 
	    return; 
	  }

	  //
	  // this action can be triggered even if we are playing another
	  // game, so we have to prevent the module from keeping this
	  // new game loaded and revert to the old / existing / active
	  // game once done.
	  //
	  let old_game_id = "";
	  if (game_self.game.id != "") { 
	    old_game_id = game_self.game.id; 
	    console.log("\n\n\nBACKING UP OUR GAME: " + old_game_id);
	
	    //
	    // we save the game because we will need to reload it
	    //
	    game_self.saveGame(old_game_id);

	  }


          let game_id = tx.transaction.from[0].add + "&" + tx.transaction.ts;

console.log("NEW GAME ID : " + game_id);

	  let game_options = {};
	  if (txmsg.options != undefined) { game_options = txmsg.options; }

          if (game_self.app.options.games != undefined) {
            for (let i = 0; i < game_self.app.options.games.length; i++) {
              if (game_self.app.options.games[i].id === game_id) {
                return;
              }
            }
          }


	  ////////////
	  // create //
	  ////////////
          game_self.loadGame(game_id);
	  for (let i = 0; i < tx.transaction.from.length; i++) {
	    game_self.addOpponent(tx.transaction.from[i].add);
	  }
	  for (let i = 0; i < tx.transaction.to.length; i++) {
	    game_self.addOpponent(tx.transaction.to[i].add);
	  }
          game_self.game.module = txmsg.module;
	  game_self.game.options = game_options;



	  //////////////////
	  // update email //
	  //////////////////
/*
          if (tx.isTo(app.wallet.returnPublicKey()) == 1) {
            let email_self = app.modules.returnModule("Email");
            let title      = game_self.emailAppName + " Invitation";
            let opponentshtml = "";
            for (let z = 0; z < tx.transaction.to.length; z++) {
              if (z > 0) { opponentshtml += ", "; }
              opponentshtml += tx.transaction.to[z].add;
            }
            let data       = 'You have been invited to a game of '+game_self.emailAppName+'. <div class="accept_invite link" id="'+game_id+'_'+txmsg.module+'">click here to accept</div>.';
            if (opponentshtml.length > tx.transaction.to[0].add.length) {
              opponentshtml += ", ";
              opponentshtml += tx.transaction.from[0].add;
              data       = 'You have been invited to a group game of '+game_self.emailAppName+' ('+opponentshtml+'). <div class="accept_invite link" id="'+game_id+'_'+txmsg.module+'">click here to accept</div>.';
            }
            email_self.receiveMail(title, data, tx);
          } else {
            let email_self = app.modules.returnModule("Email");
            let title      = game_self.emailAppName + " Invitation Sent";
            let opponentshtml = "";
            for (let z = 0; z < tx.transaction.to.length; z++) {
              if (z > 0) { opponentshtml += ", "; }
              opponentshtml += tx.transaction.to[z].add;
            }
            let data       = 'You have invited ' + opponentshtml + ' to a game of ' + game_self.emailAppName + '. Please wait for them to initiate the game.';
            email_self.receiveMail(title, data, tx);
          }
*/

          game_self.saveGame(game_id);

	  //
	  // now revert to existing / old game if needed
	  //
	  if (old_game_id != "") {
console.log("RELOADING OLD GAME: " + old_game_id);
	    game_self.loadGame(old_game_id);
	  }


          //app.storage.saveOptions();

          return;
        }




        ////////////
        // ACCEPT //
        ////////////
        if (txmsg.request === "accept") {

          game_id = txmsg.game_id;
          game_self.loadGame(game_id);

          game_self.game.options = txmsg.options;
          game_self.game.module = txmsg.module;
          game_self.saveGame(game_id);

          if (game_self.game.over == 1) {
            return;
          }


          if (game_self.game.step.game == 0) {

            if (tx.transaction.from[0].add == app.wallet.returnPublicKey()) {
              game_self.game.invitation = 0;
              game_self.game.accept = 1;
              if (game_self.app.network.isConnected() == 1) {
                game_self.saveGame(game_id);
              }
            }

            for (let i = 0; i < tx.transaction.to.length; i++) { game_self.addOpponent(tx.transaction.to[i].add); }
            game_self.game.module = txmsg.module;
            game_self.saveGame(game_id);

	  }

	  //
	  // the inviter automatically approves
	  //
	  // TODO minro security issue here with fake accepts forcing users to start games
	  // and spend network fees in initializing them. this is not a huge deal at this 
	  // point although it should be fixed later.
	  //
      	  let tmpar = game_id.split("&");
	  let originator = tmpar[0];    

	  if (originator === game_self.app.wallet.returnPublicKey()) {
	    game_self.game.invitation = 0;
	    game_self.game.accept = 1;
	    game_self.saveGame(game_id);
	  }

	  //
	  // do not return if everyone has accepted -- then we can go 
	  // immediately into queue processing
	  //
	  let has_everyone_accepted = 1;
	  for (let b = 0; b < game_self.game.accepted.length; b++) {
	    if (tx.transaction.from[0].add === game_self.game.opponents[b]) { 
	      game_self.game.accepted[b] = 1;
	      game_self.saveGame(game_id);
	    }
	    if (game_self.game.opponents[b] === originator) { 
	      game_self.game.accepted[b] = 1;
	      game_self.saveGame(game_id);
	    }
	    if (game_self.game.accepted[b] == 0) { 
	      has_everyone_accepted = 0;
	    }
	  }

	  if (has_everyone_accepted == 0) {
	    return;
	  }

	  //
	  // return if I have not accepted
	  //
	  if (game_self.game.accept == 0) { 
	    return; 
	  }

	  if (game_self.game.players_set == 0) {

	    //
	    // set our player numbers alphabetically
	    //
	    let players = [];
	    players.push(game_self.app.wallet.returnPublicKey());
	    for (let z = 0; z < game_self.game.opponents.length; z++) {
	      players.push(game_self.game.opponents[z]);
	    }
	    players.sort();


            for (let i = 0; i < players.length; i++) {
              if (players[i] === game_self.app.wallet.returnPublicKey()) {
                game_self.game.player = i+1;
              }
            }

	    game_self.game.players_set = 1;
            game_self.saveGame(game_id);
          }


          //
          // if we hit this point, everyone has accepted the game
          // so we can move into handleGame
          //
          if ( game_self.initializeGameFeeder(game_id) == 1 ) {	  

            let title = game_self.emailAppName + " Accepted";
            let data = 'Your game of ' + game_self.emailAppName + ' is initializing. During this time -- until you have been notified that the game is ready to play -- please do not close your browser.';
            let email_self = app.modules.returnModule("Email");
            email_self.receiveMail(title, data, tx);

	  } else {
	    //console.log("CANNOT INITIALIZE GAME FEEDER");
	  }

        }



        ////////////
        // INVITE //
        ////////////
        if (txmsg.request == "gameover") {

          let game_id    = txmsg.game_id;
          let module     = txmsg.module;

          let email_self = app.modules.returnModule("Email");
          let game_self  = app.modules.returnModule(module);

          game_self.loadGame(game_id);

	  if (game_self.game.over == 1) {}
	  else {

            let title      = "Game Over";
            let data       = "Your game has finished.";
            email_self.receiveMail(title, data, tx);

            game_self.game.over = 1;
	    game_self.game.queue.push("GAMEOVER\tOpponent Resigned");
            game_self.runQueue(txmsg);

	  }

          // only sender sets last block
          if (tx.transaction.from[0].add == app.wallet.returnPublicKey()) {
            game_self.game.last_block = app.blockchain.returnLatestBlockId();
          }

	  game_self.saveGame(game_id);
	  return;

        }


        //
        // at this point, we check to make sure
        // that this is not a game move that we 
        // have already dealt with
        //
        try {
          if (txmsg.step == undefined) { txmsg.step = {}; }
          if (txmsg.step.game != undefined) {
            if (txmsg.step.game <= game_self.game.step.game) {
              return;
            }
          } else {
            txmsg.step.game = 0;
            if (game_self.game.step.game > 0) {
              return;
            }
          }
          if (txmsg.extra != undefined) {
            if (txmsg.extra.target != undefined) {
              game_self.game.target = txmsg.extra.target;
            }
          } else { txmsg.extra = {}; }
          if (txmsg.turn == undefined) { txmsg.turn = []; }
          game_self.game.step.game = txmsg.step.game;
        } catch (err) {
          console.log("Error Checking Game Step: " + JSON.stringify(err));
        }


        ///////////
        // QUEUE //
        ///////////
        if (game_self.game.queue != undefined) {
          for (let i = 0; i < txmsg.turn.length; i++) { game_self.game.queue.push(txmsg.turn[i]); }
console.log("GID: " + game_self.game.id);
console.log("QUEUE: " + JSON.stringify(game_self.game.queue));
          game_self.runQueue(txmsg);
        }
      }

//    } catch (err) {
//      console.log("\n\nCAUGHT AN ERROR: "+ JSON.stringify(err) + "\n\n");
//      return; 
//    }
  }
}

Game.prototype.runQueue = function runQueue(txmsg={}) {

  //
  // txmsg already added to queue, so only 
  // sent along for reference as needed by
  // the games themselves
  // 
  let game_self = this;
  let cont = 1;

  //
  // last save before executing QUEUE
  //
  // we back up the TXMSG in case we need to 
  // reload from our saved state. We have already
  // moved the turns in the last message into this
  // queue, so once that is done we can move ahead...
  //
  game_self.game.last_txmsg = txmsg;
  game_self.saveGame(game_self.game.id);


  //
  // loop through the QUEUE as long as we are told
  // to keep processing game instructions
  //
  if (game_self.game.queue.length > 0) {
    while (game_self.game.queue.length > 0 && cont == 1) {

      let gqe = game_self.game.queue.length-1;
      let gmv = game_self.game.queue[gqe].split("\t");
        
      //
      // core game engine
      // SHUFFLE [decknum] 
      // REQUESTKEYS [decknum] sender recipient keys
      // ISSUEKEYS [decknum] sender recipient keys
      // DEAL [decknum] [player] [num_pf_cards]
      // DECKBACKUP [decknum]
      // DECKRESTORE [decknum]
      // DECKENCRYPT [decknum] [player]
      // DECKXOR [decknum] [player]
      // DECK [decknum] [array of cards]
      // POOL [poolnum]
      // FLIPCARD [decknum] [cardnum] [poolnum]
      // RESOLVEFLIP [decknum] [cardnum] [poolnum]
      // RESOLVEDEAL [decknum] recipient cards
      // RESOLVE
      // GAMEOVER [msg]
      //
      if (gmv[0] === "GAMEOVER") {
	if (game_self.browser_active == 1) {

	  let gid = $('#sage_game_id').attr('class');

	  if (gid === game_self.game.id) {
            game_self.updateStatus("Opponent Resigned");
            game_self.updateLog("Opponent Resigned");
	  }

	}
	return 0;
      }



      if (gmv[0] === "RESOLVE") {
        if (gqe == 0) {
          game_self.game.queue = [];
        } else {
          let gle = gqe-1;
          if (gle <= 0) {
            game_self.game.queue = [];
          } else {
            game_self.game.queue.splice(gle, 2);
          }
        }
        game_self.saveGame(game_self.game.id);
      }



      if (gmv[0] === "EMAIL") {
        if (gmv[1] == "ready") {
          game_self.game.initializing = 0;

          let title = game_self.emailAppName + " Game Ready";
          let data  = 'Your game of ' + game_self.emailAppName + ' is ready to begin.<p></p><div id="'+game_self.game.id+'_'+game_self.game.module+'" class="open_game link">Click here to open or continue this game.</div>';
          let email_self = game_self.app.modules.returnModule("Email");

          let newtx = new saito.transaction();
          newtx.transaction.ts = new Date().getTime();
          newtx.transaction.from = [];
          newtx.transaction.to = [];
          newtx.transaction.from.push(new saito.slip(game_self.app.wallet.returnPublicKey()));
          newtx.transaction.to.push(new saito.slip(game_self.app.wallet.returnPublicKey()));
          email_self.receiveMail(title, data, newtx, function() {});

        }
        game_self.game.queue.splice(gqe, 1);
        game_self.saveGame(game_self.game.id);
      }




      if (gmv[0] === "SHUFFLE") {
        game_self.shuffleDeck(gmv[1]);
        game_self.game.queue.splice(gqe, 1);
      }




      if (gmv[0] === "RESOLVEDEAL") {

        let deckidx = gmv[1];
        let recipient = gmv[2];
        let cards = gmv[3];

        this.updateLog("resolving deal for "+recipient+"...");

        if (game_self.game.player == recipient) {
          for (let i = 0; i < cards; i++) {
            let newcard = game_self.game.deck[deckidx-1].crypt[i];
	    
	    //
	    // if we have a key, this is encrypted
	    //
	    if (game_self.game.deck[deckidx-1].keys[i] != undefined) {
              newcard = game_self.app.crypto.decodeXOR(newcard, game_self.game.deck[deckidx-1].keys[i]);
	    }

            newcard = game_self.app.crypto.hexToString(newcard);
            game_self.game.deck[deckidx-1].hand.push(newcard);
          }
        }


        //
        // everyone purges their spent keys
        //
        game_self.game.deck[deckidx-1].keys = game_self.game.deck[deckidx-1].keys.splice(cards, game_self.game.deck[deckidx-1].keys.length - cards);
        game_self.game.deck[deckidx-1].crypt = game_self.game.deck[deckidx-1].crypt.splice(cards, game_self.game.deck[deckidx-1].crypt.length - cards);

        if (gqe == 0) {
          game_self.game.queue = [];
        } else {
          let gle = gqe-1;
          if (gle <= 0) {
            game_self.game.queue = [];
          } else {
            game_self.game.queue.splice(gle, 2);
          }
        }
        game_self.saveGame(game_self.game.id);
      }






      if (gmv[0] === "RESOLVEFLIP") {

        let deckidx = gmv[1];
        let cardnum = gmv[2];
        let poolidx = gmv[3];

	//
	// how many players are going to send us decryption keys?
	//
	let decryption_keys_needed = game_self.game.opponents.length+1;

	//
	// we add keys for cards that aren't decrypted
	//
	let cryptidx = -1;
	let clen = game_self.game.pool[poolidx-1].crypt.length;
	let hlen = game_self.game.pool[poolidx-1].hand.length;
	if (clen > hlen) { cryptidx = hlen; }

	//
	// if it is a new flip, add the card info
	//
	if (cryptidx == -1) {

	  cryptidx = hlen;

	  //
	  // copy the card info over from the deck
	  //
	  for (let z = 0; z < cardnum; z++) {
	    this.game.pool[poolidx-1].crypt.push(this.game.deck[deckidx-1].crypt[z]);
	    for (let p = 0; p < decryption_keys_needed; p++) {
	      this.game.pool[poolidx-1].keys.push([]);
	    }
	  }
	}


        this.updateLog("decrypting cards in deck flip...");


	//
	// now we can get the keys
	//
        game_self.game.queue.splice(gqe, 1);
        for (let i = 0; i < cardnum; i++) {
	  let nc = game_self.game.pool[poolidx-1].crypt[cryptidx+i];
	  let thiskey = game_self.game.queue[gqe-1-i];

	  //
	  // add the key
	  //
	  game_self.game.pool[poolidx-1].keys[cryptidx+i].push(thiskey);

	  nc = game_self.app.crypto.decodeXOR(nc, thiskey);
          game_self.game.pool[poolidx-1].crypt[cryptidx+i] = nc;
        }

	//
	// if the keys are solid, purge old deck data
	//
	let purge_deck_and_keys = 0;

	if (game_self.game.pool[poolidx-1].keys[cryptidx].length == decryption_keys_needed) {

	  game_self.game.pool[poolidx-1].decrypted = 1;
          game_self.game.deck[deckidx-1].keys = game_self.game.deck[deckidx-1].keys.splice(cardnum, game_self.game.deck[deckidx-1].keys.length - cardnum);
          game_self.game.deck[deckidx-1].crypt = game_self.game.deck[deckidx-1].crypt.splice(cardnum, game_self.game.deck[deckidx-1].crypt.length - cardnum);
	  game_self.game.queue.push("RESOLVE");
          game_self.saveGame(game_self.game.id);
	  return 1;

	} else {

          game_self.saveGame(game_self.game.id);
	  return 0;

	}
      }






      if (gmv[0] === "DEAL") {

        let deckidx = gmv[1];
        let recipient = gmv[2];
        let cards = gmv[3];

this.updateLog("dealing cards to "+recipient+"...");

        let total_players = game_self.game.opponents.length+1;

	// if the total players is 1 -- solo game
	if (total_players == 1) {

	  // go right to resolving the deal
          game_self.game.queue.push("RESOLVEDEAL\t"+deckidx+"\t"+recipient+"\t"+cards);
          game_self.game.queue.push("RESOLVEDEAL\t"+deckidx+"\t"+recipient+"\t"+cards);

	} else {

          game_self.game.queue.push("RESOLVEDEAL\t"+deckidx+"\t"+recipient+"\t"+cards);
          for (let i = 1; i < total_players+1; i++) {
            if (i != recipient) {
              game_self.game.queue.push("REQUESTKEYS\t"+deckidx+"\t"+i+"\t"+recipient+"\t"+cards);
            }
          }
	}

      }



      if (gmv[0] === "REQUESTKEYS") {

        let deckidx = gmv[1];
        let sender = gmv[2];
        let recipient = gmv[3];
        let cards = gmv[4];

this.updateLog("requesting keys for "+recipient+"...");

        //
        // sender then sends keys
        //
          if (game_self.game.player == sender) {
          game_self.game.turn = [];
          game_self.game.turn.push("RESOLVE");
          for (let i = 0; i < cards; i++) { game_self.game.turn.push(game_self.game.deck[deckidx-1].keys[i]); }
          game_self.game.turn.push("ISSUEKEYS\t"+deckidx+"\t"+sender+"\t"+recipient+"\t"+cards);
          game_self.sendMessage("game", {});
        }

        //
        // execution stops
        //
        game_self.saveGame(game_self.game.id);
        return 0;

      }



      if (gmv[0] === "ISSUEKEYS") {

        let deckidx = gmv[1];
        let sender = gmv[2];
        let recipient = gmv[3];
        let cards = gmv[4];
        let keyidx = gqe-cards; 

this.updateLog("issuing keys to "+recipient+"...");

        game_self.game.queue.splice(gqe, 1);

        if (game_self.game.player == recipient) {
             for (let i = 0; i < cards; i++) {
            game_self.game.deck[deckidx-1].crypt[i] = game_self.app.crypto.decodeXOR(game_self.game.deck[deckidx-1].crypt[i], game_self.game.queue[keyidx+i]);
          }
        }

        game_self.game.queue.splice(keyidx, cards);
        game_self.saveGame(game_self.game.id);

      }




      //
      // module requires updating
      //
      if (gmv[0] === "DECKBACKUP") {

this.updateLog("deck backup...");
        let deckidx = gmv[1];

	game_self.old_discards = game_self.game.deck[deckidx-1].discards;
	game_self.old_removed = game_self.game.deck[deckidx-1].removed;
        game_self.old_cards = {};
        game_self.old_crypt = [];
        game_self.old_keys = [];
        game_self.old_hand = [];

        for (let i = 0; i < game_self.game.deck[deckidx-1].crypt.length; i++) {
          game_self.old_crypt[i] = game_self.game.deck[deckidx-1].crypt[i];
          game_self.old_keys[i] = game_self.game.deck[deckidx-1].keys[i];
        }
        for (var i in game_self.game.deck[deckidx-1].cards) {
          game_self.old_cards[i] = game_self.game.deck[deckidx-1].cards[i];
        }
        for (let i = 0; i < game_self.game.deck[deckidx-1].hand.length; i++) {
          game_self.old_hand[i] = game_self.game.deck[deckidx-1].hand[i];
        }

        game_self.game.queue.splice(gqe, 1);

      }



      if (gmv[0] === "DECKRESTORE") {

this.updateLog("deck restore...");
        let deckidx = gmv[1];

        for (let i = game_self.old_crypt.length - 1; i >= 0; i--) {
          game_self.game.deck[deckidx-1].crypt.unshift(game_self.old_crypt[i]);
          game_self.game.deck[deckidx-1].keys.unshift(game_self.old_keys[i]);
        }
        for (var b in game_self.old_cards) {
          game_self.game.deck[deckidx-1].cards[b] = game_self.old_cards[b];
        }
        for (let i = game_self.old_hand.length - 1; i >= 0; i--) {
          game_self.game.deck[deckidx-1].hand.unshift(game_self.old_hand[i]);
        }

	game_self.game.deck[deckidx-1].removed = game_self.old_removed;
	game_self.game.deck[deckidx-1].discards = game_self.old_discards;

	game_self.old_removed = {};
	game_self.old_discards = {};

        game_self.old_cards = {};
        game_self.old_crypt = [];
        game_self.old_keys = [];
        game_self.old_hand = [];
        game_self.game.queue.splice(gqe, 1);

      }

            


      if (gmv[0] === "CARDS") {
        let deckidx = gmv[1];
        game_self.game.queue.splice(gqe, 1);
        for (let i = 0; i < gmv[2]; i++) {
          game_self.game.deck[deckidx-1].crypt[(gmv[2]-1-i)] = game_self.game.queue[gqe-1-i];
          game_self.game.queue.splice(gqe-1-i, 1);
        }
      }



      //
      // dealing into a pool makes the cards publicly visible to everyone
      //
      if (gmv[0] === "POOL") {

	this.updateLog("creating public card pool...");
        let poolidx = gmv[1];

	//
	// create deck if not exists
	//
	game_self.resetPool(poolidx-1);

	while (game_self.game.pool.length < poolidx) { game_self.addPool(); }
        game_self.game.queue.splice(gqe, 1);

      }





      if (gmv[0] === "FLIPCARD") {

        let deckidx = gmv[1];
        let cardnum = gmv[2];
        let poolidx = gmv[3];

	if (cardnum == 1) {
	  game_self.updateLog("flipping " + cardnum + " card into pool " + poolidx);
	} else {
	  game_self.updateLog("flipping " + cardnum + " cards into pool " + poolidx);
	}

	//
	// create pool if not exists
	//
	while (game_self.game.pool.length < poolidx) { game_self.addPool(); }

        //
	// share card decryption information
	//
        game_self.game.turn = [];
        game_self.game.turn.push("RESOLVE");
        for (let i = 0; i < cardnum && i < game_self.game.deck[deckidx-1].crypt.length; i++) { game_self.game.turn.push(game_self.game.deck[deckidx-1].crypt[i]); }
        game_self.game.turn.push("RESOLVEFLIP\t"+deckidx+"\t"+cardnum+"\t"+poolidx);

        let extra = {};

        game_self.sendMessage("game", extra);
        game_self.game.queue.splice(gqe, 1);

      }






      if (gmv[0] === "DECK") {

	this.updateLog("deck processing...");
        let deckidx = gmv[1];
        let cards = JSON.parse(gmv[2]);

	//
	// create deck if not exists
	//
	game_self.resetDeck(deckidx-1);

	while (game_self.game.deck.length < deckidx) { game_self.addDeck(); }
        game_self.updateStatus("creating deck by importing specified cards...");
        game_self.game.deck[deckidx-1].cards = cards;
        let a = 0; for (var i in game_self.game.deck[deckidx-1].cards) { game_self.game.deck[deckidx-1].crypt[a] = game_self.app.crypto.stringToHex(i); a++; }
        game_self.game.queue.splice(gqe, 1);

      }

            

      if (gmv[0] === "DECKXOR") {

this.updateLog("deck initial card xor...");

        let deckidx = gmv[1];

        if (game_self.game.player == gmv[2]) {

          game_self.updateStatus("encrypting deck for blind card shuffle");

          if (game_self.game.deck[deckidx-1].xor == "") { game_self.game.deck[deckidx-1].xor = game_self.app.crypto.hash(Math.random()); }

          for (let i = 0; i < game_self.game.deck[deckidx-1].crypt.length; i++) {
            game_self.game.deck[deckidx-1].crypt[i] = game_self.app.crypto.encodeXOR(game_self.game.deck[deckidx-1].crypt[i], game_self.game.deck[deckidx-1].xor);
            game_self.game.deck[deckidx-1].keys[i] = game_self.app.crypto.generateKeys();
          }
                
          //
          // shuffle the encrypted deck
          //
          game_self.game.deck[deckidx-1].crypt = game_self.shuffleArray(game_self.game.deck[deckidx-1].crypt);

          game_self.game.turn = [];
          game_self.game.turn.push("RESOLVE");
          for (let i = 0; i < game_self.game.deck[deckidx-1].crypt.length; i++) { game_self.game.turn.push(game_self.game.deck[deckidx-1].crypt[i]); }
          game_self.game.turn.push("CARDS\t"+deckidx+"\t"+game_self.game.deck[deckidx-1].crypt.length);

          let extra = {};

          game_self.sendMessage("game", extra);

        } else {
          game_self.updateStatus("opponent encrypting deck for blind card shuffle");
        }

        cont = 0;
      }





      if (gmv[0] === "DECKENCRYPT") {

this.updateLog("deck initial card encrypt...");
        let deckidx = gmv[1];

        if (game_self.game.player == gmv[2]) {

          game_self.updateStatus("encrypting shuffled deck for dealing to players...");

                for (let i = 0; i < game_self.game.deck[deckidx-1].crypt.length; i++) {
                  game_self.game.deck[deckidx-1].crypt[i] = game_self.app.crypto.decodeXOR(game_self.game.deck[deckidx-1].crypt[i], game_self.game.deck[deckidx-1].xor);
                  game_self.game.deck[deckidx-1].crypt[i] = game_self.app.crypto.encodeXOR(game_self.game.deck[deckidx-1].crypt[i], game_self.game.deck[deckidx-1].keys[i]);
                }

          game_self.game.turn = [];
          game_self.game.turn.push("RESOLVE");
          for (let i = 0; i < game_self.game.deck[deckidx-1].crypt.length; i++) { game_self.game.turn.push(game_self.game.deck[deckidx-1].crypt[i]); }
          game_self.game.turn.push("CARDS\t"+deckidx+"\t"+game_self.game.deck[deckidx-1].crypt.length);

                let extra = {};
                game_self.sendMessage("game", extra);

        } else {
                game_self.updateStatus("opponent encrypting shuffled deck for dealing to players...");
        }

        cont = 0;
      }

            

      //
      // if we hit this point, kick our
      // commands into the module and 
      // let it tell us whether we 
      // continue.
      //
      if (cont == 1) {
        cont = game_self.handleGame(txmsg);
      }

      //
      // break if requested
      //
      if (cont == 0) {
	//
	// saving here causes problems when we place OPS and then
	// reload as our OPS command has already been removed. So 
	// what breaks if we do not save on "do not continue?"
	//
        //game_self.saveGame(game_self.game.id);
        return;
      }
    }
  } else {
    return game_self.handleGame(txmsg);
  }
}





/////////////////////
// Dice Management //
/////////////////////
//
// use callback temporarily until better async / await integration
//
Game.prototype.rollDice = function rollDice(sides = 6, mycallback = null) {
  this.game.dice = this.app.crypto.hash(this.game.dice);
  let a = parseInt(this.game.dice.slice(0, 12), 16) % sides;
  if (mycallback != null) { 
    mycallback((a + 1)); 
  } else { 
    return (a + 1); 
  }
}
Game.prototype.initializeDice = function initializeDice() {
  if (this.game.dice === "") { this.game.dice = this.app.crypto.hash(this.game.id); }
}




//////////////////
// Shuffle Deck //
//////////////////
Game.prototype.shuffleDeck = function shuffleDeck(deckidx=0) {

  //
  // shuffling the deck
  //
  this.updateLog("shuffling deck");
  this.updateStatus("Shuffling the Deck");

  let new_cards = [];
  let new_keys = [];

  let old_crypt = this.game.deck[deckidx-1].crypt;
  let old_keys = this.game.deck[deckidx-1].keys;

  let total_cards = this.game.deck[deckidx-1].crypt.length;
  let total_cards_remaining = total_cards;

  for (let i = 0; i < total_cards; i++) {

    // will never have zero die roll, so we subtract by 1
    let random_card = this.rollDice(total_cards_remaining) - 1;  

    new_cards.push(old_crypt[random_card]);
    new_keys.push(old_keys[random_card]);

    old_crypt.splice(random_card, 1);
    old_keys.splice(random_card, 1);

    total_cards_remaining--;

  }

  this.game.deck[deckidx-1].crypt = new_cards;
  this.game.deck[deckidx-1].keys = new_keys;

}



////////////
// Resign //
////////////
Game.prototype.resignGame = function resignGame(reason="") {

  //
  // send game over message
  //
  var newtx = this.app.wallet.createUnsignedTransactionWithDefaultFee(this.app.wallet.returnPublicKey(), 0.0);
  for (let z = 0; z < this.game.opponents.length; z++) { newtx.transaction.to.push(new saito.slip(this.game.opponents[z], 0.0)); }
  if (newtx == null) { alert("ERROR: bug? unable to make move. Do you have enough SAITO tokens?"); return; }

  if (this.game.over == 0) {

    this.game.over = 1;
    this.game.last_block = this.app.blockchain.returnLatestBlockId();
    this.saveGame(this.game.id);

    newtx.transaction.msg.module  = this.game.module;
    newtx.transaction.msg.request = "gameover";
    newtx.transaction.msg.game_id = this.game.id;
    newtx.transaction.msg.module  = this.game.module;
    newtx.transaction.msg.reason  = reason;
    newtx = this.app.wallet.signTransaction(newtx);
    this.app.network.propagateTransaction(newtx);

  }

}




/////////////////////
// Game Management //
/////////////////////
Game.prototype.handleGame = function handleGame(msg) {
  console.log("GAME HANDLE GAME FUNCTION - this should be overridden by your game");
}






Game.prototype.initializeDeck = function initializeDeck(cards = null) {

  this.updateStatus("shuffling our deck of cards...");

  let msg = {};
  msg.extra = {};
  msg.extra.target = 1;
  msg.turn = [];

  if (cards != null) { msg.turn = cards; }

  this.handleDeck(msg);

}















/////////////////////////
// Game Initialization //
/////////////////////////
Game.prototype.initialize = function initialize(app) {

  this.app.connection.on('connection_dropped', () => {
    this.flagConnectionUnstable();
  });
  this.app.connection.on('connection_up', () => {
    this.flagConnectionStable();
  });

  if (app.BROWSER == 0) { return; }
  if (this.browser_active == 0) { return; }

  //
  // screen ratio
  //
  let gameheight = $('.gameboard').height();
  let gamewidth = $('.gameboard').width();
  this.screenRatio = gamewidth / this.gameboardWidth;

  //
  // we grab the game with the 
  // most current timestamp (ts)
  // since no ID is provided
  //
  this.loadGame();

  //
  // dice initialization
  //
  if (this.game.dice === "") {
    this.game.dice = app.crypto.hash(this.game.id);
  }

  this.initializeGameFeeder(this.game.id);

}


Game.prototype.scale = function scale(x) {
  let y = Math.floor(this.screenRatio * x);
  return y;
}









///////////////////////////
// Sending and Receiving //
///////////////////////////
Game.prototype.sendMessage = function sendMessage(type = "game", extra = {}, mycallback = null) {

  var game_self = this;

  if (this.game.opponents == undefined) {
    //alert("ERROR: bug? no opponents found for this game.");
    return;
  }
  if (this.game.opponents.length < 1) {
    //alert("ERROR: bug? no opponents found for this game.");
    return;
  }


  let mymsg = {};

  var ns = {};
  ns.game = this.game.step.game;
  ns.deck = this.game.step.deck;
  ns.deal = this.game.step.deal;

  if (type == "game") {
    ns.game++;
    mymsg.request = "game";
  }

  mymsg.turn = this.game.turn;
  mymsg.module = this.name;
  mymsg.game_id = this.game.id;
  mymsg.player = this.game.player;
  mymsg.step = ns;
  mymsg.extra = extra;

  //
  // two player games can go off-chain by default
  // if there are private proxy channels with mod-proxy
  //
  let use_offchain = 0;
  if (this.game.opponents.length == 1) {
    if (this.app.network.canSendOffChainMessage(this.game.opponents[0]) == 1) {
      use_offchain = 1;
    }
  }


  //
  // start the timer that will monitor disconnection
  //
  clearInterval(game_self.connection_monitor_timer);
  game_self.connection_monitor_timer = setInterval( () => {

      // clear timer to avoid disconnection message
      game_self.flagConnectionUnstable();      
      clearInterval(game_self.connection_monitor_timer);

  }, game_self.connection_monitor_speed);



  if (use_offchain == 1 && this.offchain == 1) {

    setTimeout(() => {
      game_self.app.network.sendOffChainMessageWithCallback(game_self.game.opponents[0], mymsg, function() {

        // clear timer to avoid disconnection message
        game_self.flagConnectionStable();
        clearInterval(game_self.connection_monitor_timer);

      });

      var newtx = game_self.app.wallet.createUnsignedTransaction(game_self.app.wallet.returnPublicKey(), 0.0, 0.0);
      for (let i = 0; i < game_self.game.opponents.length; i++) { newtx.transaction.to.push(new saito.slip(game_self.game.opponents[i], 0.0)); }
      if (newtx == null) { 
	//alert("ERROR: bug? unable to make move. Do you have enough SAITO tokens?"); 
	return; 
     } 
     newtx.transaction.msg = mymsg;
      newtx = game_self.app.wallet.signTransaction(newtx);

      //
      // run callback before we process this next message
      //
      game_self.game.last_txmsg = "";
      game_self.saveGame(game_self.game.id);
      if (mycallback != null) { 
        mycallback();
      }
      game_self.onConfirmation(null, newtx, 0, game_self.app);

    }, 1000);


  } else {

    var newtx = this.app.wallet.createUnsignedTransactionWithDefaultFee(this.app.wallet.returnPublicKey(), 0.0);

    if (newtx == null) {
      //alert("ERROR: Unable to make move. Do you have enough SAITO tokens?");
      return;
    }

    for (let i = 0; i < this.game.opponents.length; i++) {
      newtx.transaction.to.push(new saito.slip(this.game.opponents[i], 0.0));
    }

    newtx.transaction.msg = mymsg;
    newtx = this.app.wallet.signTransaction(newtx);

    //
    // add to pending queue in wallet
    //
    game_self.app.wallet.wallet.pending.push(JSON.stringify(newtx.transaction));
    game_self.game.last_txmsg = "";
    game_self.saveGame(game_self.game.id);

    game_self.app.network.propagateTransactionWithCallback(newtx, function (errobj) {

      if (errobj != undefined) {
        console.log("ERROBJ: " + JSON.stringify(errobj));
        if (errobj.length > 2) {
          if (errobj.length > 2) {
              let obj = JSON.parse(errobj);
            if (obj.err != "") {
              console.log("Broadcasting Status Uncertain!");
              return;
            }
          }
        }
      }

      // clear timer to avoid disconnection message
      game_self.flagConnectionStable();
      clearInterval(game_self.connection_monitor_timer);

      if (mycallback != null) { mycallback(); }
    });

  }
}









////////////////////////
// Saving and Loading //
////////////////////////
Game.prototype.loadGame = function loadGame(game_id = null) {

  if (this.app.options.games == undefined) { this.app.options.games = []; }

  //
  // load most recent game
  //
  // when we click on a link in our email client, we update the TS
  // of the game we wish to open, so that when the client loads we
  // can load that particular game. This permits multiple games to
  // exist simultaneously.
  //
  if (game_id == null) {

    let game_to_open = 0;

    for (let i = 0; i < this.app.options.games.length; i++) {
      if (this.app.options.games[i].ts > this.app.options.games[game_to_open].ts) {
        game_to_open = i;
      }
    }

    if (this.app.options.games == undefined) {
      game_id = null;
    } else {
      if (this.app.options.games.length == 0) {
        game_id = null;
      } else {
        game_id = this.app.options.games[game_to_open].id;
      }
    }
  }

  if (game_id != null) {
    for (let i = 0; i < this.app.options.games.length; i++) {
      if (this.app.options.games[i].id === game_id) {
        this.game = JSON.parse(JSON.stringify(this.app.options.games[i]));
        return this.game;
      }
    }
  }

  //
  // otherwise subsequent save will be blank
  //
  this.game = this.newGame(game_id);
  this.saveGame(game_id);
  return this.game;

}
Game.prototype.newGame = function newGame(game_id = null) {

  if (game_id == null) { game_id = Math.random().toString(); }

  let game = {};
      game.id           = game_id;
      game.player       = 1;
      game.players_set  = 0;
      game.target       = 1;
      game.invitation   = 1;
      game.initializing = 1;
      game.accept       = 0;
      game.over         = 0;
      game.winner       = 0;
      game.module       = "";
      game.ts           = new Date().getTime();
      game.last_block   = 0;
      game.last_txmsg   = "";
      game.options      = {};
      game.options.ver  = 1;
      game.step         = {};
      game.step.game    = 0;
      game.step.deck    = 0;
      game.step.deal    = 0;

      game.queue        = [];
      game.turn         = [];
      game.opponents    = [];
      game.deck         = []; // shuffled cards
      game.pool         = []; // pools of revealed cards
      game.dice         = "";

      game.status       = ""; // status message
      game.log          = [];

  return game;

}
Game.prototype.addPool = function addPool() {
  let newIndex = this.game.pool.length;
  this.resetPool(newIndex);
}
Game.prototype.addDeck = function addDeck() {
  let newIndex = this.game.deck.length;
  this.resetDeck(newIndex);
}
Game.prototype.resetPool = function resetPool(newIndex=0) {
  this.game.pool[newIndex] = {};
  this.game.pool[newIndex].cards    = {};
  this.game.pool[newIndex].crypt    = [];
  this.game.pool[newIndex].keys     = [];
  this.game.pool[newIndex].hand     = [];
}
Game.prototype.resetDeck = function resetDeck(newIndex=0) {
  this.game.deck[newIndex] = {};
  this.game.deck[newIndex].cards    = {};
  this.game.deck[newIndex].crypt    = [];
  this.game.deck[newIndex].keys     = [];
  this.game.deck[newIndex].hand     = [];
  this.game.deck[newIndex].xor      = "";
  this.game.deck[newIndex].discards = {};
  this.game.deck[newIndex].removed  = {};
}

Game.prototype.saveGame = function saveGame(game_id = null) {

  if (this.app.options.games == undefined) { 
    this.app.options.games = []; 
  }

  if (game_id != null) {
    for (let i = 0; i < this.app.options.games.length; i++) {
      if (this.app.options.games[i].id === game_id) {
        // never save an empty game
        if (this.game == undefined) { console.log("Saving Game Error: safety catch 1"); return; }
        if (this.game.id != game_id) { console.log("Saving Game Error: safety catch 2"); return; }
        this.app.options.games[i] = JSON.parse(JSON.stringify(this.game));
        this.app.storage.saveOptions();
        return;
      }
    }
  }

  if (this.game.id === game_id) {
    this.app.options.games.push(this.game);
  } else {
    this.game = this.newGame(game_id);
  }

  this.app.storage.saveOptions();
  return;

}










///////////////
// Callbacks //
///////////////
//
// These function should be extended by the game module. They are essentially
// dummy functions to which control is passed at various points in order to
// ensure that the upper-level game modules can execute their own mechanisms.
//
Game.prototype.isValidTurn = function isValidTurn(msg) {
  return 1;
}
Game.prototype.initializeGame = function initializeGame(game_id) {
  //
  // already done
  //
  //this.loadGame(game_id);
}
//
// returns 1 if initialization is run
//
Game.prototype.initializeGameFeeder = function initializeGameFeeder(game_id) {

  if (this.initialize_game_run == 1) { return 0; } else { this.initialize_game_run = 1; }
  this.initializeGame(game_id);


  //
  // add element to DOM with game_id if available
  //
  if (this.browser_active == 1) {
    try {
      if ($('saito_game_id').length == 0) {
	let html = '<div id="sage_game_id" class="'+this.game.id+'"></div>';
	$("body").append(html);
      } else {}
    } catch (err) {}
  }


  //
  // requires game moves to be decrypted... rebroadcast pending
  //
  for (let i = 0; i < this.app.wallet.wallet.pending.length; i++) {
    let tmptx = new saito.transaction(this.app.wallet.wallet.pending[i]);
    let txmsg = tmptx.returnMessage();
    let game_self  = this.app.modules.returnModule(txmsg.module);
    if (txmsg.game_id == undefined) { return; }
    if (txmsg.game_id != this.game.id) { return; }
    if (game_self == this) {
      this.updateStatus("Rebroadcasting our last move to be sure opponent receives it. Please wait for your opponent to move.");
      this.updateLog("we just rebroadcast our last move to be sure opponent receives it. please wait for your opponent to move.");
      //
      // avoid making multiple moves
      //
      return 0;
    }
  }



  this.runQueue();
  return 1;
}
Game.prototype.updateBoard = function updateBoard(move) {
  console.log("MOVE: " + move.move);
  console.log("RAND: " + move.rand);
}
















///////////
// Email //
///////////
//
// These functions handle integration with the default Saito email client.
// They provide a generic way for users to send invitations to other users
// over the email network, as well as to accept games and begin them.
//
Game.prototype.displayEmailForm = function displayEmailForm(app) {
  element_to_edit = $('#module_editable_space');
  element_to_edit_html = '<div id="module_instructions" class="module_instructions">Invite the recipient to play a game of ' + this.emailAppName + '.</div>';
  element_to_edit.html(element_to_edit_html);
}
Game.prototype.formatEmailTransaction = function formatEmailTransaction(tx, app) {
  tx.transaction.msg.module = this.name;
  tx.transaction.msg.request = "invite";
  return tx;
};
Game.prototype.attachEmailEvents = function attachEmailEvents(app) {

  var game_self = this;
  var email_self = app.modules.returnModule("Email");

  if (app.BROWSER == 1) {

    $('.accept_invite').off();
    $('.accept_invite').on('click', function () {

      let tmpid = $(this).attr('id');
      let tmpar = tmpid.split("_");

      let game_id = tmpar[0];
      let game_module = tmpar[1];

      // email
      let remote_address  = $('.lightbox_message_from_address').text();

      // arcade menu
      if (remote_address == "" || remote_address == undefined) {
	remote_address = $(this).parent().find('.acceptgameopponents').attr("id");
      }

      tmpar = remote_address.split("_");
      for (let z = 0; z < tmpar.length; z++) { tmpar[z] = tmpar[z].trim(); }

      game_self = app.modules.returnModule(game_module);

      game_self.saveGame(game_id);
      for (let i = 0; i < tmpar.length; i++) {
        game_self.addOpponent(tmpar[i]);
      }
      game_self.game.player = 2;
      game_self.game.module = game_module;
      game_self.saveGame(game_id);

      //
      // send official message accepting
      //
      var newtx = app.wallet.createUnsignedTransactionWithDefaultFee(tmpar[0], 0.0);
      for (let i = 1; i < tmpar.length; i++) {
        newtx.transaction.to.push(new saito.slip(tmpar[i], 0.0));
      }
      if (newtx == null) {
        alert("ERROR: bug? unable to make move. Do you have enough SAITO tokens?");
        return;
      }

      newtx.transaction.msg.module   = game_self.game.module;
      newtx.transaction.msg.options  = game_self.game.options;
      newtx.transaction.msg.game_id  = game_self.game.id;
      newtx.transaction.msg.request  = "accept";
      newtx = app.wallet.signTransaction(newtx);
      app.network.propagateTransaction(newtx);

      email_self.showBrowserAlert("You have accepted the game invitation");
      email_self.closeMessage();

    });

    $('.open_game').off();
    $('.open_game').on('click', function () {

      let tmpid = $(this).attr('id');
      let tmpar = tmpid.split("_");
      let game_id = tmpar[0];
      let game_module = tmpar[1];
      this.game = game_self.loadGame(game_id);
      this.game.ts = new Date().getTime();
      this.game.module = game_module;
      game_self.saveGame(game_id);
      window.location = '/' + game_module.toLowerCase();

    });
  }
}
Game.prototype.addOpponent = function addOpponent(address) {
  if (address == "") { return; }
  if (address == this.app.wallet.returnPublicKey()) { return; }
  if (this.game.opponents == undefined) { this.game.opponents = []; }
  if (this.game.accepted == undefined) { this.game.accepted = []; }
  for (let i = 0; i < this.game.opponents.length; i++) {
    if (this.game.opponents[i] == address) { return; }
  }
  this.game.opponents.push(address);
  this.game.accepted.push(0);
}
Game.prototype.acceptGame = function acceptGame(address) {
  if (this.game.opponents == undefined) { this.game.opponents = []; }
  if (this.game.accepted == undefined) { this.game.accepted = []; }
  for (let i = 0; i < this.game.opponents.length; i++) {
    if (this.game.opponents[i] == address) { this.game.accepted[i] = 1; }
  }
  return;
}




///////////////////////
// Utility Functions //
///////////////////////
/**
 * Fisher–Yates shuffle algorithm:
 *
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 *
 */
Game.prototype.shuffleArray = function shuffleArray(a) {
  var j, x, i;
  for (i = a.length - 1; i > 0; i--) {
    j = Math.floor(Math.random() * (i + 1));
    x = a[i];
    a[i] = a[j];
    a[j] = x;
  }
  return a;
}
Game.prototype.returnNextPlayer = function returnNextPlayer(num) {
  let p = parseInt(num) + 1;
  if (p > (this.game.opponents.length + 1)) { return 1; }
  return p;
}
Game.prototype.updateStatus = function updateStatus(str) {

  this.game.status = str;
  console.log("STATUS: " + str);
  if (this.app.BROWSER == 1) { $('#status').html(str) }

}
Game.prototype.updateLog = function updateLog(str, length = 10) {

   if (str) {
    this.game.log.unshift(str);
    if (this.game.log.length > length) { this.game.log.splice(length); }
  }

  let html = '';

  for (let i = 0; i < this.game.log.length; i++) {
    if (i > 0) { html += '<br/>'; }
    html += "> " + this.game.log[i];
  }

  console.log("LOG: " + html);
  if (this.app.BROWSER == 1) { $('#log').html(html) }

}



Game.prototype.flagConnectionUnstable = function flagConnectionUnstable() {
  try {
    console.log("Connection Unstable...");
    this.updateLog("connection unstable... if the error message persists, reloading your browser will force a reconnect and rebroadcast of your last move.");
    $('.connection_monitor').show();
  } catch (err) {}
}
Game.prototype.flagConnectionStable = function flagConnectionStable() {
  try {
    $('.connection_monitor').hide();
  } catch (err) {}
}


Game.prototype.returnGameOptionsHTML = function returnGameOptionsHTML() { return ""; }



