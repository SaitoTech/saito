const fs = require('fs');
const saito = require('../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/template');
const sqlite = require('sqlite');
var numeral = require('numeral');
const path = require("path");
const axios = require('axios');
const markdown = require( "markdown" ).markdown;

class Arcade extends ModTemplate {

  constructor(app) {

    super();

    var dir = path.join(__dirname, '../../data');

    this.app             = app;

    this.dir             = dir;

    this.name            = "Arcade";
    this.browser_active  = 0;
    this.emailAppName    = "Arcade";

    this.active_game     = "";

    this.viewing_game_creator = 0;
    this.viewing_game_initializer = 0;

    this.initialization_check_active = true;
    this.initialization_check_timer  = null;
    this.initialization_check_timer_interval = 500;
    this.initialization_check_timer_ellapsed = 0;

    this.db              = null;
    this.games           = {}
    this.games.open      = [];
    this.games.nav       = { selected: 'open' };

  }






  ////////////////
  // Initialize //
  ////////////////
  async initialize() {

    if (this.app.BROWSER == 1 && this.browser_active == 1) {

      let {host, port, protocol} = this.app.network.peers[0].peer;
      let games_data = await axios.get(`${protocol}://${host}:${port}/arcade/opengames`);

      open_games = games_data.data.payload;

      for (let i = 0; i < open_games.length; i++) {
        let id = this.app.keys.findByPublicKey(open_games[i].player);
        if (id != null) {
          if (id.identifiers[0] !== "") { open_games[i].identifier = id.identifiers[0]; }
        }

        let time_until_game_is_removed = open_games[i].expires_at - new Date().getTime();
        this.removeOpenGameSetTimer(open_games[i], time_until_game_is_removed);

        this.games.open.push(open_games[i]);
      }

      this.populateGamesTable();
      renderGamesTable(this.games[this.games.nav.selected], this.app.wallet.returnPublicKey());

      // fetch dreddit posts
      var subreddit = "";
      var post_id = "";
      var comment_id = "";
      var offset = 0;

      if (post_id == "") {
        let message             = {};
        message.request         = "reddit load all";
        message.data            = {};
        message.data.request    = "reddit load all";
        message.data.subreddit  = subreddit;
        message.data.post_id    = post_id;
        message.data.comment_id = comment_id;
        message.data.offset     = offset;
        this.app.network.sendRequest(message.request, message.data);
        //this.dredditStore.setLoadingPosts(true);
      }


      this.attachEvents();

    }

    if (this.app.BROWSER == 1 || this.app.SPVMODE == 1) { return; }

    if (this.db == null) {
      try {
        this.db = await sqlite.open(`${this.dir}/arcade.sq3`);
        var sql = `CREATE TABLE IF NOT EXISTS mod_arcade (
          id INTEGER,
          player TEXT,
          player2 TEXT,
          winner INTEGER,
          game_bid INTEGER,
          game_id TEXT,
          game TEXT,
          state TEXT,
          status TEXT,
          options TEXT,
          sig TEXT,
          created_at INTEGER,
          expires_at INTEGER,
          country_code INTEGER,
          sms INTEGER,
          PRIMARY KEY (id ASC))`;
        await this.db.run(sql, {});

        sql = `CREATE TABLE IF NOT EXISTS mod_games (
          id INTEGER,
          mod_arcade_id INTEGER,
          game_id TEXT,
          state TEXT,
	  player_pkey TEXT,
          key_state TEXT,
          module TEXT,
          bid INTEGER,
          tid INTEGER,
          lc INTEGER,
          last_move INTEGER,
          PRIMARY KEY (id ASC))`;
        await this.db.run(sql, {});

      } catch (err) {
      }
    }

  }


  initializeHTML(app) {

    let arcade_self = this;

    // display our publickey
    $('#my_publickey').html(
      `${this.app.wallet.returnPublicKey().substring(0,16)}...`
    );

    //
    // timer to check DNS of unknown games
    //
    setTimeout(function() {

      var keystocheck = [];

      $('.game_cell_player').each(function() {
        var author_address = $(this).attr("id");
        var visible_author = $(this).text();
        if (visible_author.indexOf("...") > 0) {
          keystocheck.push(author_address);
        }
      });

      for (var cfg = 0; cfg < keystocheck.length; cfg++) {

        let thispublickey = keystocheck[cfg];

        // fetch the ID for this KEY and update if FOUND
        app.dns.fetchIdentifier(thispublickey, function(answer) {

          if (app.dns.isRecordValid(answer) == 0) {
            return;
          }

          let dns_response = JSON.parse(answer);
          let myidentifier = dns_response.identifier;
          let mypublickey = dns_response.publickey;

          $('.game_cell_player').each(function() {
            var tmpid = $(this).attr('id');
	    if (tmpid === mypublickey) {
	      $(this).text(myidentifier);
	    }
	  });
	});
      }

    //
    // 1.5 second delay
    //
    }, 1500);



    if (invite_page != undefined) {
    if (invite_page == 1) {

      //
      // check that we do not have an existing game with this inviter
      //
      let game_exists = 0;
      let game_exists_idx = 0;
      if (app.options.games != undefined) {
        for (let i = 0; i < app.options.games.length; i++) {
          if (app.options.games[i].opponents.length > 0) {
            if (app.options.games[i].opponents[0] === invite_data.pubkey) {
              if (app.options.games[i].over == 0) {
                game_exists = 1;
                game_exists_idx = i;
              }
            }
          }
        }
      }

      if (game_exists == 1) {
        app.options.games[idx].ts = new Date().getTime();
        this.saveGame(app.options.games[game_exists_idx].id);
        $('.invite_main').html('You already have a game with this opponent.<p></p><a href="/twilight">Join this Game</a>');
        $('.invite_main').css('font-size','1.7em');
        return;
      }

      $('.inviting_address').html(invite_data.pubkey.substring(0,8));
      $('.invite_title').html(invite_data.module);

      if (parseFloat(this.app.wallet.returnBalance()) <= 0) {
        $('.get_tokens_button').off();
        $('.get_tokens_button').on('click', () => {
          $('#token_spinner').show();
          let {host, port, protocol} = this.app.network.peers[0].peer;
          $.get(`${protocol}://${host}:${port}/faucet/tokens?address=${this.app.wallet.returnPublicKey()}`, (response, error) => {
            $('#token_spinner').hide();
            if (response.payload.status) {
              $('#token-success').show();
            } else {
              alert("We're sorry, we were unable to retrieve your tokens. If you're having difficulties, regenerate the link and try again");
            }
          });
          $('.get_tokens_button').hide();
        });
      } else {
        $('.get_tokens_button').hide();
        $('.invite_play_button').show();
        $('.invite_play_button').off();
        $('.invite_play_button').on('click', function() {
          arcade_self.acceptGameInvitation();
          arcade_self.invitePlayButtonClicked();
          $('.status').show();
        });
      }

      return;
    }
    }

    if (app.wallet.returnIdentifier() != "") {
      $('#dont_be_a_hash').hide();
    }

    //
    // add chat
    //

    const chat = app.modules.returnModule("Chat");
    chat.addPopUpChat();
    $('#chat_main').bind("DOMSubtreeModified", function() {
      let expiry = new Date().getTime();
      
      console.log("clearing in-chat game invites");
      $(".live_invite").each( function() {
        let invitets = this.id; 
        if (expiry >= invitets) {
          $(this).removeClass("live_invite");
          this.innerHTML = "Invite Expired";
          $(this).css("background", "#aaaaaa");
        }
      });
    });
  }




  /////////////////////////////////
  // ShouldAffixCallbacktoModule //
  /////////////////////////////////
  shouldAffixCallbackToModule(modname) {
    if (modname === "Arcade") { return 1; }
    if (modname === "Solitrio") { return 1; }
    if (modname === "Twilight") { return 1; }
    if (modname === "Poker") { return 1; }
    if (modname === "Pandemic") { return 1; }
    if (modname === "Chess") { return 1; }
    if (modname === "Wordblocks") { return 1; }
    return 0;
  }




  ////////////////
  // onNewBlock //
  ////////////////
  async onNewBlock(blk, lc) {
    // let arcade_self = blk.app.modules.returnModule("Arcade");
    // arcade_self.refreshOpenGames();
  }





  ////////////////////
  // onConfirmation //
  ////////////////////
  async onConfirmation(blk, tx, conf, app) {

    let arcade_self = app.modules.returnModule("Arcade");

    if (tx == null) { return; }

    if (app.BROWSER == 0) {
      if (conf == 0) {
        let txmsg = tx.returnMessage();

        //
        // save game state if provided
        //
        if (txmsg.saveGameState != undefined && txmsg.game_id != "") {
          let sql = "SELECT id FROM mod_arcade WHERE game_id = $game_id";
	  let keystate_to_save = "";
	  if (txmsg.saveKeyState != undefined) { keystate_to_save = txmsg.saveKeyState; }
	  let player_pkey = tx.transaction.from[0].add;
          let params = {
            $game_id : txmsg.game_id 
          }
console.log("\n\n\n");
console.log(sql);
console.log(params);
console.log("\n\n\n");
          try {
            let rows = await arcade_self.db.all(sql, params);
	    if (rows != null) {
	    if (rows.length > 0) {
	      let row = rows[0];
              sql = "INSERT INTO mod_games (game_id, player_pkey, key_state, mod_arcade_id, module, state, bid, tid, lc, last_move) VALUES ($game_id, $playerpkey, $keystate, $mod_arcade_id, $module, $state, $bid, $tid, $lc, $last_move)";
              params = {
                $game_id : txmsg.game_id ,
	              $playerpkey : player_pkey ,
	              $keystate : keystate_to_save ,
                $mod_arcade_id : row.id ,
                $module : txmsg.module ,
                $state : JSON.stringify(txmsg.saveGameState) ,
	              $bid : blk.block.id ,
	              $tid : tx.transaction.id ,
	              $lc : 1 ,
	              $last_move : (new Date().getTime())
              }
              try {
                let res = arcade_self.db.run(sql, params);
              } catch (err) {
                console.log("error updating database in arcade...");
               return;
              }
            }
	    }
	  } catch (err) {
	    console.log("error fetching mod_arcade game id...");
	    return;
	  }
	}



        //
        // update database to remove game from list
        //
        if (txmsg.request == "invite") {

          // if game creator provided a phone number, we'll fire a text message to them
          let sql = "SELECT country_code, sms from mod_arcade where sig = $sig";
          let params = {
            $sig: txmsg.sig
          };

          try {
            let res = await arcade_self.db.get(sql, params);
            if (res != null) {
              const twilio = require('../twilio/twilio');
              let {country_code, sms} = res;

              let phone_number = `+${country_code}${sms}`;
              let message = `[SAITO ARCADE - ${new Date().getTime()}] Your game has been accepted! Please go to https://apps.saito.network to start.`;

              twilio.sendSms(phone_number, message);
            }
          } catch(err) {
            console.log("Error retrieving phone number from database");
            //return; don't return hee - as we still want to update the db.
          }

          let game_id = tx.transaction.from[0].add + '&' + tx.transaction.ts;

          sql = "UPDATE mod_arcade SET state = 'active', game_id = $gid , player2 = $player2 WHERE sig = $sig";
          params = {
            $gid : game_id ,
            $player2 : tx.transaction.from[0].add ,
            $sig : txmsg.sig
          }
          try {
            await arcade_self.db.run(sql, params);

            arcade_self.app.network.sendRequest('arcade remove opengame', { sigs: [txmsg.sig] });
          } catch (err) {
            console.log("error updating database in arcade...");
            return;
          }
        }





        //
        // arcade tracks winners and losers
        //
        if (txmsg.request == "gameover") {
          let sql = "UPDATE mod_arcade SET state = $state WHERE game_id = $game_id";
          let params = {
            $state: 'over',
            $game_id : txmsg.game_id
          }
          try {
            let res = arcade_self.db.run(sql, params);
          } catch (err) {
            console.log("error updating database in arcade...");
            return;
          }
        }




        if (txmsg.request == "accept") {
          let publickeys = tx.transaction.to.map(slip => slip.add);
          let removeDuplicates = (names) => names.filter((v,i) => names.indexOf(v) === i)
          let unique_keys = removeDuplicates(publickeys);

          let sql1 = "SELECT sig FROM mod_arcade WHERE state = $state AND player IN ($player1, $player2, $player3, $player4)"
          let sql2 = "UPDATE mod_arcade SET state = 'expired' WHERE state = $state AND player IN ($player1, $player2, $player3, $player4)";
          let params = {
            $state : 'open',
            $player1 : unique_keys[0] || '',
            $player2 : unique_keys[1] || '',
            $player3 : unique_keys[2] || '',
            $player4 : unique_keys[3] || '',
          }
          try {
            let resp = await arcade_self.db.all(sql1, params);
            await arcade_self.db.run(sql2, params);

            let sigs = resp.map(res => res.sig);
            arcade_self.app.network.sendRequest("arcade remove opengame", { sigs });
          } catch (err) {
            console.log("error updating database in arcade...");
            console.log(err)
            return;
          }
        }




        if (txmsg.module == "Arcade" && txmsg.request == "opengame") {

          let game    = "";
          let state   = "";
          let pkey    = "";
          let options = "";
          let created_at = new Date().getTime();
          let sig     = "";

          let validfor     = 60;
          let sms          = 0;
          let country_code = 0;

          var gameid = "";
          var adminid = "";

          if (txmsg.game != "") { game = txmsg.game; }
          if (txmsg.state != "") { state = txmsg.state; }
          pkey = tx.transaction.from[0].add;

          if (txmsg.options != "") { options = txmsg.options; }
          if (txmsg.ts != "") { created_at = parseInt(txmsg.ts); }
          if (txmsg.sig != "") { sig = txmsg.sig; }

          if (txmsg.validfor != "") { validfor = txmsg.validfor; }
          if (txmsg.cc != "")       { country_code = txmsg.cc; }
          if (txmsg.sms != "")      { sms = txmsg.sms; }

          if (game.gameid != undefined && game.gameid != "") {
            gameid = game.gameid;
            adminid = `${game.gameid}_${game.game}`;
          }

          if (game.winner != undefined && game.winner != "") {
            winner = game.winner;
          }

          let expires_at = created_at + (60000 * parseInt(validfor));

          var sql = "INSERT INTO mod_arcade (player, state, game_bid, game, options, created_at, sig, expires_at, country_code, sms) VALUES ($player, $state, $bid, $game, $options, $created_at, $sig, $expires_at, $country_code, $sms)";
          var params = {
            $player : pkey ,
            $game : game ,
            $state : state ,
            $bid : blk.block.id ,
            $options : JSON.stringify(options) ,
            $sig : sig ,
            $created_at : created_at ,
            $expires_at : expires_at ,
            $country_code : parseInt(country_code) ,
            $sms : parseInt(sms)
          }

          try {
            let res = await arcade_self.db.run(sql, params);

            let opengame = {
              player: pkey ,
              winner : "",
              game: game,
              state : state,
              status : "",
              options : JSON.stringify(options),
              sig : sig,
              created_at : created_at,
              expires_at: expires_at,
              gameid : gameid,
              adminid : adminid
            };

            // propagate the message to our peers
            arcade_self.app.network.sendRequest("arcade opengame", opengame);
          } catch (err) {
            console.log("There is an error here: " + err);
          }

          return;
        }
      }
    } else {

      //
      // browsers remove listed games on accept (technically invited)
      //
      let txmsg = tx.returnMessage();

      if (txmsg.request == "invite") {

        if (arcade_self.browser_active == 1) {

          let removed_any_games = 0;
          for (let i = 0; i < arcade_self.games.open.length; i++) {
            if (arcade_self.games.open[i].sig == txmsg.sig) {
              arcade_self.games.open.splice(i, 1);
              i--;
              removed_any_games = 1;
            }
          }
          if (removed_any_games == 1) {
            renderGamesTable(arcade_self.games[arcade_self.games.nav.selected], arcade_self.app.wallet.returnPublicKey());
            arcade_self.attachEvents();
          }
        }

        // return;

      }


      if (txmsg.request == "opengame") {

        if (arcade_self.browser_active == 1) {

          let game_exists = arcade_self.games.open.some((game) => game.sig === txmsg.sig);
          if (!game_exists) {
            let game = {
              player: tx.transaction.from[0].add,
              state: txmsg.state,
              bid: blk.block.id,
              game: txmsg.game,
              options: txmsg.options,
              status: "Waiting for opponent",
              created_at: txmsg.ts,
              sig: txmsg.sig
            }

            let id = arcade_self.app.keys.findByPublicKey(game.player);
            if (id != null) {
              if (id.identifiers[0] !== "") { game.identifier = id.identifiers[0]; }
            }

	    //
	    // purge old invitations which have not been accepted
	    // 
            let datenow = new Date().getTime();
	    let duration = datenow - game.created_at;
            var milliseconds = parseInt((duration % 1000) / 100),
                seconds = Math.floor((duration / 1000) % 60),
                minutes = Math.floor((duration / (1000 * 60)) % 60),
                hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

            if (minutes > 30) {
	      game.state = "expired";
	      game.status = "invitation expired";
	      return;
	    }

            arcade_self.games.open.push(game);
            renderGamesTable(arcade_self.games[arcade_self.games.nav.selected], arcade_self.app.wallet.returnPublicKey());
            arcade_self.attachEvents();
          }
        }

        return;
      }
    }



    //
    // pass controls into games
    //
    try {
      if (tx.isTo(app.wallet.returnPublicKey()) == 1) {
        arcade_self.handleOnConfirmation(blk, tx, conf, app);
      }
    } catch (err) {
      console.log("Error in Arcade: " + JSON.stringify(err));
      return;
    }
  }





  handleOnConfirmation(blk, tx, conf, app) {

    //
    // only browsers deal with this mess of code
    //
    if (this.app.BROWSER == 0) { return; }

    let txmsg = tx.returnMessage();
    let remote_address = tx.transaction.from[0].add;
    let arcade_self = this;

    if (conf == 0) {

      //
      // DECLINE
      //
      if (txmsg.request == "decline") {
        if (tx.isTo(app.wallet.returnPublicKey()) == 1 && tx.isFrom(app.wallet.returnPublicKey()) == 0) {
          if (this.viewing_game_initializer == 1 || invite_page == 1) {
            $('.manage_invitations').html(`
              <center>Your opponent has declined the game as they have already started one!</center>
            `);
            $('.status').show();
            $('#game_spinner').hide();
            this.attachEvents(this.app);
          }
        }
        if (tx.isTo(app.wallet.returnPublicKey()) == 1 && tx.isFrom(app.wallet.returnPublicKey()) == 1) {
          if (this.viewing_game_initializer == 1 || invite_page == 1) {
            $('.manage_invitations').html(`
              <center>You have received multiple acceptances to your game. Refusing all but the first acceptance.</center>
            `);
            $('.status').show();
            $('#game_spinner').hide();
            this.attachEvents(this.app);
          }
        }
       return;
      }



      //
      // INVITE
      //
      if (txmsg.request == "invite") {

        if (tx.isTo(app.wallet.returnPublicKey()) == 1 && tx.isFrom(app.wallet.returnPublicKey()) == 1) {
            let game_id = tx.transaction.from[0].add + "&" + tx.transaction.ts;
            let game_module = tx.transaction.msg.module;
            this.startInitializationTimer(game_id, game_module);
        }
        if (tx.isTo(app.wallet.returnPublicKey()) == 1 && tx.isFrom(app.wallet.returnPublicKey()) == 0) {

          try {

            let game_id = tx.transaction.from[0].add + "&" + tx.transaction.ts;
            let game_module = tx.transaction.msg.module;

            //
            // do nothing if already watching this game initialize
            //
            if (app.options.games != undefined) {
              for (let i = 0; i < app.options.games.length; i++) {
                if (app.options.games[i].id == game_id) {
                  if (app.options.games[i].invitation == 0) {
                    if (this.viewing_game_initializer == 1) {
                      if (txmsg.ts != "" && txmsg.sig != "") {
                        if (this.app.crypto.verifyMessage(txmsg.ts.toString(), txmsg.sig.toString(), this.app.wallet.returnPublicKey())) {
                          try {
                            if (invite_page == 1) {
                              return;
                            }
                          } catch (err) {
                          }
                        } else {
                          return;
                        }
                      }
                    } else {
                    }
                  }
                }
              }
            }

            let tmpmod = txmsg.module;
            this.active_game = tmpmod.charAt(0).toUpperCase();
            this.active_game += tmpmod.slice(1);

            let title = "Your game has been accepted";
            let message = "Click here to play";

            if (!this.app.browser.isMobileBrowser(navigator.userAgent)) {
              this._createGameNotification(
                title,
                message,
                () => this._onclickGameNotification()
              );
            } else {
              Notification.requestPermission(function(result) {
                if (result === 'granted') {
                  navigator.serviceWorker.ready.then(function(registration) {
                    registration.showNotification(title, {
                      body: message,
                      icon: '/img/Logo-blue-icon.png',
                      vibrate: [200, 100, 200, 100, 200, 100, 200],
                      tag: 'arcade-notification'
                    });
                  });
                }
              });
            }

            //
            //
            //
            if (this.browser_active == 1) {

              if (txmsg.ts != "" && txmsg.sig != "") {
                if (this.app.crypto.verifyMessage(txmsg.ts.toString(), txmsg.sig.toString(), this.app.wallet.returnPublicKey())) {
                  if (blk.block.id >= this.app.blockchain.last_bid) {
                    this.showGameInitializer();
                    this.startInitializationTimer(game_id, txmsg.module);
                  }
                }
              } else {

                //
                // MANUALLY ACCEPT INVITE
                //
                let opponent = tx.transaction.from[0].add;
                let id = this.app.keys.findByPublicKey(opponent)
                if (id != null) {
                  if (id.identifiers[0] !== "") { opponent = id.identifiers[0]; }
                }
                let text = `You have been invited to a game of ${this.active_game} by ${opponent}`;

                var modal = document.getElementById("game_modal");
                modal.style.display = "block";

                $('#game_creation_form').hide();

                $('#modal_header_text').html('New Game Invite');
                $('#modal_body_text').html(text);
                $('#game_start_options').html(`<button class="accept_game accept_game_button" id="${game_id}_${tmpmod}"> ACCEPT</button>`);

                $('.accept_game_button').off();
                $('.accept_game_button').on('click', function() {

                  let tmpid = $(this).attr('id');
                  let tmpar = tmpid.split("_");
                  let game_id = tmpar[0];
                  let game_module = tmpar[1];

                  let game_self = arcade_self.app.modules.returnModule(txmsg.module);
                  let opponents = [];

                  for (let z = 0; z < tx.transaction.to.length; z++) {
                    if (! opponents.includes(tx.transaction.to[z].add)) {
                      opponents.push(tx.transaction.to[z].add);
                    }
                  }

                  game_self.loadGame(game_id);
                  game_self.saveGame(game_id);
                  game_self.game.options = txmsg.options;
                  game_self.game.invitation = 0;
                  game_self.game.accept = 1;
                  game_self.game.player = 2;
                  game_self.game.module = game_module;
                  game_self.saveGame(game_id);

                  //
                  // send official message accepting
                  //
                  var newtx = arcade_self.app.wallet.createUnsignedTransactionWithDefaultFee(opponents[0], 0.0);
                  if (newtx == null) {
                    alert("ERROR: bug 104? unable to make move. Do you have enough SAITO tokens?");
                    return;
                  }
                  for (let i = 1; i < opponents.length; i++) {
                    newtx.transaction.to.push(new saito.slip(opponents[i], 0.0));
                  }

                  newtx.transaction.msg.options  = game_self.game.options;
                  newtx.transaction.msg.module   = game_module;
                  newtx.transaction.msg.game_id  = game_id;
                  newtx.transaction.msg.request  = "accept";

                  newtx = arcade_self.app.wallet.signTransaction(newtx);
                  arcade_self.app.network.propagateTransaction(newtx);

                  arcade_self.showGameInitializer();
                  arcade_self.startInitializationTimer(game_id, txmsg.module);
                });
              }
            }
          } catch (err) {
          }
        }
      }


      //
      // ACCEPT
      //
      if (txmsg.request == "accept") {

        try {

          let game_self = app.modules.returnModule(txmsg.module);
          game_self.loadGame(txmsg.game_id);

          //
          // don't get triggered by closed games
          //
          if (game_self.game.over == 1) { return; }

          if (tx.transaction.to[0].add == app.wallet.returnPublicKey()) {
            game_self.game.invitation = 0;
            game_self.game.accept = 1;
          }

          //
          // if I have accepted...
          //
          // if (game_self.game.accept === 1) {
          //   return;
          // }

          if (game_self.game.initializing == 1) {

            if (game_self.game.accept == 0) {

              return;

            } else {

              if (blk.block.id >= game_self.app.blockchain.last_bid) {
                this.hideGameCreator();
                this.showGameInitializer();
                this.startInitializationTimer(txmsg.game_id, txmsg.module);
              }

            }
          } else {
            // alert("This game is ready to be played");
          }
        } catch (err) {
console.log("ERROR");
        }
      }
    }
  }


  handlePeerRequest(app, message, peer, mycallback) {
    if (app.BROWSER == 1) {
      switch(message.request) {
        case "arcade opengame":
          let id = this.app.keys.findByPublicKey(message.data.player);
          if (id != null) {
            if (id.identifiers[0] !== "") { message.data.identifier = id.identifiers[0]; }
          }
          this.games.open.push(message.data);

          let time_until_game_is_removed = message.data.expires_at - new Date().getTime();
          this.removeOpenGameSetTimer(message.data, time_until_game_is_removed);

          renderGamesTable(this.games.open);
          this.attachEvents();
          break;
        case "arcade remove opengame":
          this.games.open = this.games.open.filter((game) => {
            return !message.data.sigs.some(sig => sig == game.sig);
          });
          renderGamesTable(this.games.open);
          this.attachEvents();
          break;
        case "reddit payload":
          try {
            let posts = message.data.map(post =>  {
              post.post_author = post.tx.from[0].add
              let id = this.app.keys.findByPublicKey(post.post_author);
              if (id != null) {
                if (id.identifiers[0] !== "") { post.post_author = id.identifiers[0]; }
              }
              return post
            });

            this.posts = posts;
            renderForumTable(this.posts);
          } catch(err) {
            console.error("ERROR IN ARCADE FORUM: ", err);
          }
          break;
        default:
          break;
      }
    }
  }

  ////////////////////
  // Attach Events //
  ///////////////////
  attachEvents() {

    let arcade_self = this;

    //
    // BUTTONS IN TABLE WITH AVAILABLE GAMES
    //

    //
    // join an existing game
    //
    $('.join_game').off();
    $('.join_game').on('click', function () {
      let tmpid = $(this).attr('id');
      let tmpar = tmpid.split("_");
      let game_id = tmpar[0];
      let game_module = tmpar[1];
      let game_self = arcade_self.app.modules.returnModule(game_module);
      game_self.game = game_self.loadGame(game_id);
      game_self.game.ts = new Date().getTime();
      //
      // ensure init happens appropriately
      //
      game_self.game.initialize_game_run = 0;
      game_self.game.module = game_module;
      game_self.saveGame(game_id);
      window.location = '/' + game_module.toLowerCase();
    });



    //
    // accept invites
    //
    $('.accept_game').off();
    $('.accept_game').on('click', function() {

      let id = $(this).attr("id");

      // if accepting a game, the id is our sig
      for (let i = 0; i < arcade_self.games.open.length; i++) {
        if (arcade_self.games.open[i].sig === id) {
          if (arcade_self.games.open[i].player == arcade_self.app.wallet.returnPublicKey()) { alert('You cannot accept a game with yourself'); return; }
          if (arcade_self.app.wallet.returnBalance() > arcade_self.app.wallet.returnDefaultFee()) {

            var newtx = arcade_self.app.wallet.createUnsignedTransactionWithDefaultFee(arcade_self.app.wallet.returnPublicKey(), 0.0);
              if (newtx == null) {
                alert("ERROR: bug? unable to accept invitation. Do you have enough SAITO tokens?");
                return;
              }

              newtx.transaction.to.push(new saito.slip(arcade_self.games.open[i].player, 0.0));
              newtx.transaction.msg.module  = arcade_self.games.open[i].game;
              newtx.transaction.msg.request = "invite";
              newtx.transaction.msg.options = JSON.parse(arcade_self.games.open[i].options);
              newtx.transaction.msg.ts      = arcade_self.games.open[i].created_at;
              newtx.transaction.msg.sig     = arcade_self.games.open[i].sig;

              newtx = arcade_self.app.wallet.signTransaction(newtx);
              arcade_self.app.network.propagateTransaction(newtx);

            //alert("Please be patient while the network starts to initialize the game!");

              let game_id = `${arcade_self.app.wallet.returnPublicKey()}&${arcade_self.games.open[i].created_at}`
              let game_module = arcade_self.games.open[i].game;

              arcade_self.hideArcadeHome();
              arcade_self.showGameInitializer();

          } else {
            alert("Your account does not have SAITO tokens. Please get some for free from the Faucet...");
          }
          return;
        }
      }
    });


    //
    // accept invitation from a friend)
    //
    $('.accept_game_button').off();
    $('.accept_game_button').on('click', function() {

      let tmpid = $(this).attr('id');
      let tmpar = tmpid.split("_");

      let game_id = tmpar[0];
      let game_module = tmpar[1];

      arcade_self.startInitializationTimer(game_id, game_module);

      if ($('.lightbox_message_from_address').length > 0) {
        let remote_address = $('.lightbox_message_from_address').text();
        if ($(this).parent().parent().find('.acceptgameopponents').length > 0) {
          remote_address = $(this).parent().parent().find('.acceptgameopponents').attr("id");
        }
        tmpar = remote_address.split("_");
      }


      for (let z = 0; z < tmpar.length; z++) { tmpar[z] = tmpar[z].trim(); }

      game_self = arcade_self.app.modules.returnModule(game_module);
      game_self.loadGame(game_id);

      game_self.saveGame(game_id);
      for (let i = 0; i < tmpar.length; i++) {
        game_self.addOpponent(tmpar[i]);
      }
      game_self.game.invitation = 0;
      game_self.game.accept = 1;
      game_self.game.player = 2;
      game_self.game.module = game_module;
      game_self.saveGame(game_id);

      //
      // send official message accepting
      //
      var newtx = arcade_self.app.wallet.createUnsignedTransactionWithDefaultFee(tmpar[0], 0.0);
      for (let i = 1; i < tmpar.length; i++) {
        newtx.transaction.to.push(new saito.slip(tmpar[i], 0.0));
      }
      if (newtx == null) {
        alert("ERROR: bug 102? unable to make move. Do you have enough SAITO tokens?");
        return;
      }

      // newtx.transaction.msg.options  = game_self.game.options;
      newtx.transaction.msg.module   = game_module;
      newtx.transaction.msg.game_id  = game_id;
      newtx.transaction.msg.request  = "accept";

      newtx = arcade_self.app.wallet.signTransaction(newtx);
      arcade_self.app.network.propagateTransaction(newtx);

    });



    //
    // delete games
    //
    $('.delete_game').off();
    $('.delete_game').on('click', function() {

      let tmpid = $(this).attr('id');

      //
      // delete expired games - this works as only 1 outstanding game at a time
      //
      if (tmpid == undefined || tmpid == "undefined") {
        for (let i = 0; i < arcade_self.app.options.games.length; i++) {
          if (arcade_self.app.options.games[i].accept == 0) {
            arcade_self.app.options.games.splice(i, 1);
            i--;
          }
	}

	arcade_self.app.storage.saveOptions();
	return;

      }


      let tmpar = tmpid.split("_");
      let gameid = tmpar[0];
      let game_module = tmpar[1];
      let game_self = null;

      //
      // if game_moduleis undefined
      //
      if (game_module == undefined) {
        return;
      }

      try {
        game_self = arcade_self.app.modules.returnModule(game_module);
        game_self.loadGame(gameid);
        if (game_self.game.over == 0) {
          game_self.resignGame();
          game_self.game.over = 1;
          game_self.game.last_block = arcade_self.app.blockchain.returnLatestBlockId();
        } else {
          game_self.game.over = 1;
          game_self.game.last_block = arcade_self.app.blockchain.returnLatestBlockId();
        }
        game_self.saveGame(gameid);
      } catch (err) {
        console.log("ERROR DELETING GAME: " + err);
      }

      for (let i = 0; i < arcade_self.app.options.games.length; i++) {
        if (i < 0) { i = 0; }
        if (arcade_self.app.options.games.length == 0) {
        } else {

          if (arcade_self.app.options.games[i].id == undefined) {
            arcade_self.app.options.games.splice(i, 1);
            i--;
          } else {
            if (arcade_self.app.options.games[i].id == gameid) {
              if (arcade_self.app.options.games[i].last_block > 0 && (arcade_self.app.options.games[i].last_block+10) < arcade_self.app.blockchain.returnLatestBlockId()) {
                arcade_self.app.options.games.splice(i, 1);
                i--;
              }
            }
          }
          try {
            if (arcade_self.app.options.games[i].over == 1 && ((parseInt(arcade_self.app.options.games[i].last_block)+10) < arcade_self.app.blockchain.returnLatestBlockId())) {
              arcade_self.app.options.games.splice(i, 1);
              i--;
            }
            if (arcade_self.app.options.games[i].opponents.length == 0) {
              arcade_self.app.options.games.splice(i, 1);
              i--;
            }
          } catch(err) {
            console.log(err)
          }
        }
      }
      arcade_self.app.storage.saveOptions();

      //
      // acknowledge
      //
      window.location = "/arcade";

    });

    $('.return_to_arcade').off();
    $('.return_to_arcade').on('click', () => {
      this.hideGameCreator();
      this.showArcadeHome();
      this.attachEvents();
    });




    //
    // GAME CREATION -- "find opponent" on site
    //
    $('#create_game_button').off();
    $('#create_game_button').on('click', () => {

      //
      // only let people list 1 game at a time to avoid game-ending bugs
      //
      for (let i = 0; i < this.games.open.length; i++) {
        if (this.games.open[i].player == this.app.wallet.returnPublicKey() && this.games.open[i].state == "open") {
          if (this.app.BROWSER == 1) { alert("Help avoid bugs. You cannot have two open invitations."); }
          return;
        }
      }



      let options    = {};

      $('form input, form select').each(
        function(index) {
          var input = $(this);
          if (input.is(":checkbox")) {
            if (input.prop("checked")) {
              options[input.attr('name')] = 1;
            }
          } else {
            options[input.attr('name')] = input.val();
          }
        }
      );

      if (this.app.wallet.returnBalance() > this.app.wallet.returnDefaultFee()) {

        var newtx = this.app.wallet.createUnsignedTransactionWithDefaultFee(this.app.wallet.returnPublicKey(), 0.0);
          if (newtx == null) {
            alert("ERROR: bug? unable to accept invitation. Do you have enough SAITO tokens?");
            return;
          }

          // sms and limit ?
          let country_code = $(".country_code").val();
          let sms_num = $(".player_sms").val();
          let valid_for = $(".invitation_valid_for").val();

          let game_module = this.app.modules.returnModule(this.active_game);

          newtx.transaction.to.push(new saito.slip(this.app.wallet.returnPublicKey(), 0.0));
          newtx.transaction.msg.module   = "Arcade";
          newtx.transaction.msg.request  = "opengame";
          newtx.transaction.msg.game     = this.active_game;
          newtx.transaction.msg.state    = "open";
          newtx.transaction.msg.options  = game_module.returnQuickLinkGameOptions(options);
          newtx.transaction.msg.ts       = new Date().getTime();
          newtx.transaction.msg.sig      = this.app.wallet.signMessage(newtx.transaction.msg.ts.toString(), this.app.wallet.returnPrivateKey());
          newtx.transaction.msg.cc       = "";
          newtx.transaction.msg.sms      = "";
          newtx.transaction.msg.validfor = "";

          if (country_code != undefined) { newtx.transaction.msg.cc = country_code; }
          if (sms_num != undefined) { newtx.transaction.msg.sms = sms_num; }
          if (valid_for != undefined) { newtx.transaction.msg.validfor = valid_for; }

          newtx = this.app.wallet.signTransaction(newtx);
          this.app.network.propagateTransaction(newtx);

          this.createOpenGameSuccess()
          renderGamesTable(this.games[this.games.nav.selected], arcade_self.app.wallet.returnPublicKey());
          this.hideGameCreator();
          this.showArcadeHome();
          this.attachEvents();


      } else {
        alert("Your account does not have SAITO tokens. Please get some for free from the Faucet...");
      }

    });


    $('#find_opponent_modal_button').off();
    $('#find_opponent_modal_button').on('click', () => {
      this.findOpponentModal();
      this.attachEvents();
    });

    $('#find_opponent_modal_button_mob').off();
    $('#find_opponent_modal_button_mob').on('click', () => {
      let invite_html = "<div class='chat-game-invite'>I would love to play a game of:<br />" + this.renderModalOptions("chat_link") + "<div>Click to accept.</div></div>";
      $('#chat_new-message-input').text(invite_html);
      $('.return_to_arcade').trigger('click');
      $('.chat-send-message-button').trigger('click');
      $('#chat_header').trigger("click");  
      this.mobileInviteModal();
    });

    $('#invite_by_publickey').off()
    $('#invite_by_publickey').on('click', () => {
      this.inviteByPublickeyModal();
      this.attachEvents();
    });

    $('#invite_by_link').off()
    $('#invite_by_link').on('click', () => {
      this.inviteByLinkModal()
      this.attachEvents();
    });

    //
    // CREATE GAME - Step #1
    //
    $('.game').off();
    $('.game').on('click', function() {

      arcade_self.active_game = $(this).attr("id");
      arcade_self.hideArcadeHome();
      arcade_self.showGameCreator();

      if (arcade_self.active_game == "Solitrio") {
	window.location = "/solitrio";
	return;
      }


      if (arcade_self.active_game == "Twilight") {
        $('.publisher_message').html("Twilight Struggle is <a href=\"https://github.com/trevelyan/ts-blockchain/blob/master/license/GMT_Vassal_Modules.pdf\" style=\"border-bottom: 1px dashed;cursor:pointer;\">released for use</a> in open source gaming engines provided that at least one player has purchased the game. By clicking to start a game you confirm that either you or your opponent has purchased a copy. Please support <a href=\"https://gmtgames.com\" style=\"border-bottom: 1px dashed; cursor:pointer\">GMT Games</a> and encourage further development of Twilight Struggle by <a style=\"border-bottom: 1px dashed;cursor:pointer\" href=\"https://www.gmtgames.com/p-588-twilight-struggle-deluxe-edition-2016-reprint.aspx\">picking up a physical copy of the game</a>");
        $('.publisher_message').show();
      }
      if (arcade_self.active_game == "Pandemic") {
        $('.publisher_message').html("Pandemic is owned by <a href=\"https://www.zmangames.com\" style=\"border-bottom: 1px dashed;cursor:pointer;\">Z-Man Games</a>. This edition uses the VASSAL module available for <a href=\"http://www.vassalengine.org/wiki/Module:Pandemic\" style=\"border-bottom: 1px dashed;cursor:pointer;\">public download</a> and non-commercial usage from VASSAL since 2015. Usage conditions for VASSAL modules require that at least one player has purchased the game. By clicking to start a game you confirm that either you or your opponent has purchased a copy.");
        $('.publisher_message').show();
      }
    });

    //
    // CREATE GAME -- STEP #2
    // invite_friend
    // game_button
    $('#invite_friend').off();
    $('#invite_friend').on('click', () => {
      this.inviteByLinkModal();
      this.attachEvents();
    });

    //
    // additional modal event listeners
    //
    $('.close').off();
    $('.close').on('click', () => {
      var modal = document.getElementById("game_modal");
      modal.style.display = "none";
    });

    $(window).off();
    $(window).on('click', () => {
      var modal = document.getElementById("game_modal");
      if (event.target == modal) {
        $('.close').off();
        modal.style.display = "none";
      }
    });

    $('#game_creation_form').off();
    $('#game_creation_form').on("change", (event) => {
      let gameSelectHTML = this.renderModalOptions(event.target.id);
      $('#game_start_options').innerHTML = '';
      $('#game_start_options').html(gameSelectHTML);

      this.attachEvents();
    });





    //
    // Games Table
    //
    $('.games-nav-menu-item').off();
    $('.games-nav-menu-item').on('click', (event) => {

      document.getElementById(this.games.nav.selected).className = "";

      let id = $(this).attr("id");
      this.games.nav.selected = id;
      document.getElementById(this.games.nav.selected).className = "highlighted";

      showGamesTable(this.games[id]);
    });


    //
    // Copy invite link functionality
    //
    $('#copy_quick_link_button').off();
    $('#copy_quick_link_button').on('click', () => {
      let url_input = document.getElementsByClassName("quick_link_input");
      url_input[0].select();
      document.execCommand("copy");
    });


    $('#invite_button').off();
    $('#invite_button').on('click', async function() {

      // $('.invite_button_switch').hide();

      var newtx;
      let options         = {};

      $('form input, form select').each(
        function(index) {
          var input = $(this);
          if (input.is(":checkbox")) {
            if (input.prop("checked")) {
              options[input.attr('name')] = 1;
            }
          } else {
            options[input.attr('name')] = input.val();
          }
        }
      );

      let opponent_inputs = $('.opponent_address');

      for (let i = 0; i < opponent_inputs.length; i++) {
        let address = opponent_inputs[i];
        address = $(address).val().trim();

        if (address == arcade_self.app.wallet.returnPublicKey()) {
          alert("You cannot invite yourself to play a game -- if you really want to try, use two browsers!");
          return;
        }

        if (arcade_self.app.crypto.isPublicKey(address) == 0) {
          if (address.indexOf("@saito") == -1 && address.length > 0) {
            alert("All invited players must be identified by publickey or Saito email address");
            return;
          }

          address = await arcade_self.app.dns.fetchPublicKeyPromise(address);
        }

        if (i == 0) {
          newtx = arcade_self.app.wallet.createUnsignedTransactionWithDefaultFee(address, 0.0);
          if (newtx == null) {
            alert("ERROR: bug 103? unable to make move. Do you have enough SAITO tokens?");
            return;
          }
        } else {
          if (arcade_self.app.crypto.isPublicKey(address) == 1) {
            newtx.transaction.to.push(new saito.slip(address, 0.0));
          }
        }
      }

      newtx.transaction.msg.module  = arcade_self.active_game;
      newtx.transaction.msg.request = "invite";
      newtx.transaction.msg.options = options;
      newtx.transaction.msg.sig     = newtx.transaction.sig;
      newtx.transaction.msg.pubkey  = arcade_self.app.wallet.returnPublicKey();
      newtx = arcade_self.app.wallet.signTransaction(newtx);
      arcade_self.app.network.propagateTransaction(newtx);

      $('#modal_header_text').html('Game Sent');
      $('#modal_body_text').html('Game invitation has been sent. Please keep your browser open. This will update when the game is accepted.');
      $('#game_creation_form').html('');
      $('#game_start_options').html('');

      let game_id = newtx.transaction.from[0].add + "&" + newtx.transaction.ts;
      let active_module = newtx.transaction.msg.module;
      arcade_self.startInitializationTimer(game_id, active_module);
    });


    $('.forum_post_button').off();
    $('.forum_post_button').on('click', () => {
      this.showForumPostModal();
      this.attachEvents();
    });

    $('.toggle_post_button').off();
    $('.toggle_post_button').on('click', () => {
      var text = $('#submit_text').val();
      let markdown_preview = markdown.toHTML(text);

      $('.toggle-preview-text').empty();
      $('.toggle-preview-text').append(markdown_preview);

      $('.submit_text').toggle();
      $('.toggle-preview-text').toggle();
    });

    // submit new post
    $('#submit_button').off();
    $('#submit_button').on('click', () => {

      // fetch data from tx
      var msg = {};
      msg.module  = "Reddit";
      msg.type      = "post";
      msg.title     = $('#submit_title').val();
      msg.link      = $('#submit_link').val();
      msg.text      = $('#submit_text').val();
      msg.subreddit = $('#submit_r').val();

      var regex=/^[0-9A-Za-z]+$/;

      // check OK
      if (regex.test(msg.subreddit)) {} else {
        if (msg.subreddit != "") {
          alert("Only alphanumeric characters permitted in sub-reddit name");
          return;
        } else {
          msg.subreddit = "main";
        }
      }


      if (msg.title == "") {
        alert("You cannot submit an empty post");
        return;
      }

      var amount = 0.0;
      var fee    = 2.0001;

      // send post across network
      var newtx = this.app.wallet.createUnsignedTransactionWithDefaultFee(this.app.network.peers[0].peer.publickey, amount);

      if (newtx == null) { alert("Unable to send TX"); return; }
      newtx.transaction.msg = msg;
      newtx = this.app.wallet.signTransaction(newtx);
      this.app.network.propagateTransactionWithCallback(newtx, function() {
        alert("your post has been broadcast");
        $('#submit_post').toggle();
        $('.submit').toggle();
        $('.balance').css("right", "5.5rem");
        $('#posts').toggle();
        $('.modal').hide();
      });
    });

    $('#arcade_reg_id').off();
    $('#arcade_reg_id').on('click', () => {
      this.showRegModal();
      this.attachEvents();
    });

    $('#arcade_reg_button').off();
    $('#arcade_reg_button').on('click', () => {
      const registry = this.app.modules.returnModule("Registry");
      registry.clientRegistryRequest($('.reg_id').val(), (err) => {
        if (!err) {
          alert("Your registration request has been submitted. Please wait several minutes for network confirmation");
          var modal = document.getElementById("game_modal");
          modal.style.display = "none";
          $('#dont_be_a_hash').hide();
        } else {
          alert("There was an error submitting your request to the network. This is an issue with your network connection or wallet");
          $("#arcade_reg_field").val("")
        }
      });
    });
  }

  startInitializationTimer(game_id, game_module) {
    let arcade_self = this;

console.log("----------------");
console.log("--INITIALIZING--");
console.log("----------------");

    try {

      if (arcade_self.is_initializing == false) { this.initialization_check_timer_ellapsed = 0; }

      arcade_self.is_initializing = true;
      arcade_self.initialization_check_timer = setInterval(() => {

        arcade_self.initialization_check_timer_ellapsed++;

        if (invite_page != undefined) {
        if (invite_page == 1) {
          if ($('.status').html() === "") {
            if (arcade_self.initialization_check_timer_ellapsed == 3) { $('.invite_description').html(`<center>Checking to Confirm that Opponent is Online....</center>`); }
            if (arcade_self.initialization_check_timer_ellapsed == 8) { $('.invite_description').html(`<center>Still Checking to Confirm that Opponent is Online....</center>`); }
            if (arcade_self.initialization_check_timer_ellapsed == 12) { $('.invite_description').html(`<center>Waiting for Response from Opponent....</center>`); }
            if (arcade_self.initialization_check_timer_ellapsed == 20) { $('.invite_description').html(`<center>Still Waiting for Response from Opponent....</center>`); }
            if (arcade_self.initialization_check_timer_ellapsed == 32) { $('.invite_description').html(`<center>Still, Still Waiting for Response from Opponent....</center>`); }
            if (arcade_self.initialization_check_timer_ellapsed == 45) { $('.invite_description').html(`<center>One More Minute. Have you checked they are still online...?</center>`); }
          } else {
            $('.invite_description').html(`<center>Initializing Game with Opponent. Please stay on this page....</center>`);
          }
        }
        }

        let pos = -1;
        if (arcade_self.app.options.games != undefined) {
          for (let i = 0; i < arcade_self.app.options.games.length; i++) {
            if (arcade_self.app.options.games[i].id == game_id) {
                pos = i;
            }
          }
        }

        if (pos == -1) {
          return;
        }

        if (arcade_self.app.options.games[pos].initializing == 0) {
          let html = `
          <center id="start_game_container">
            <div id="join_game_invite_description">Your game is ready:</div>
            <a href="/${game_module.toLowerCase()}">
              <button class="link linkbutton join_game start_game" id="invite_join_button">
                START
              </button>
            </a>
          </center>
          `;
          //<div id="return_to_arcade" class="return_to_arcade"><i class="fa fa-arrow-circle-left"></i> Return to Arcade</div>
          $('.initialize_game_container').html(html);
          // $('.manage_invitations').css('display:flex;');
          $('.initialize_game_container').show();
          if (this.browser_active == 1) { $('#status').hide(); $('#game_spinner').hide()}
          arcade_self.is_initializing = false;
          clearInterval(arcade_self.initialization_check_timer);
          arcade_self.attachEvents(this.app);
        }

      }, arcade_self.initialization_check_timer_interval);

    } catch (err) {
      alert("ERROR checking if game is initialized!");
    }

  }





  ////////////////////
  // Update Balance //
  ////////////////////
  updateBalance(app) {

    if (app.BROWSER == 0) { return; }

    //
    // invite page stuff here
    //
    try {
      if (invite_page != undefined) {
      if (invite_page == 1 && !this.is_initializing) {
        $('.invite_play_button').css('background-color','darkorange');
        $('.invite_play_button').css('border', '1px solid darkorange');
        $('.invite_play_button').show();
        $('.invite_play_button').off();
        $('.invite_play_button').on('click', () => {
          this.acceptGameInvitation();
          this.invitePlayButtonClicked();
        });
        return;
      }
      }
    } catch (err) {}


    $('.saito_balance').html(app.wallet.returnBalance().replace(/0+$/,'').replace(/\.$/,'\.0'));

    if (app.wallet.returnBalance() >= 2) {
      $('.funding_alert').hide();
      $('.create-game-container').show();
    }
  }

  acceptGameInvitation() {

    let arcade_self = this;

    var newtx = arcade_self.app.wallet.createUnsignedTransactionWithDefaultFee(arcade_self.app.wallet.returnPublicKey(), 0.0);
    if (newtx == null) {
      alert("ERROR: bug? unable to accept invitation. Do you have enough SAITO tokens?");
      return;
    }

    newtx.transaction.to.push(new saito.slip(invite_data.pubkey, 0.0));
    newtx.transaction.msg.module  = invite_data.module;
    newtx.transaction.msg.request = "invite";
    newtx.transaction.msg.options = invite_data.options;
    newtx.transaction.msg.ts      = invite_data.ts;
    newtx.transaction.msg.sig     = invite_data.sig;

    newtx = arcade_self.app.wallet.signTransaction(newtx);

    arcade_self.app.network.propagateTransaction(newtx);

    let game_id = newtx.transaction.from[0].add + "&" + newtx.transaction.ts;
    let game_module = newtx.transaction.msg.module;

    arcade_self.startInitializationTimer(game_id, game_module);

    this.active_game = invite_data.module;
    let game_self = this.app.modules.returnModule(invite_data.module);
    //
    // another game might be loaded already, so we make sure
    // we are dealing with something fresh
    //
    game_self.loadGame(game_id);
    //
    // save for good measure
    //
    game_self.saveGame(game_id);

    //
    // fast redirects seem to break stuff as old blocks re-run
    //
    //window.location = '/arcade';
    //window.location = '/' + invite_data.module;

  }

  removeOpenGameSetTimer(new_game, time_until_game_is_removed) {
    setTimeout(() => {
      this.games.open = this.games.open.filter(game => game.sig != new_game.sig);
      renderGamesTable(this.games.open);
    }, time_until_game_is_removed);
  }

  mobileInviteModal() {
    var modal = document.getElementById("game_modal");
    var modalTitle = document.getElementById("modal_header_text");
    var modalBody = document.getElementById("modal_body_text");
      
    let html = `<div>Your invitation has been added to the chat box as a message.</br>
            Oponents will let you know if they would like to accept.</div>`;
    modalTitle.innerHTML = "Invite Sent";
    modalBody.innerHTML = html;
    modal.style.display = "block";
  }

  findOpponentModal() {
    var modal = document.getElementById("game_modal");
    modal.style.display = "block";

    var modalTitle = document.getElementById("modal_header_text");
    modalTitle.innerHTML = "";
    modalTitle.appendChild(document.createTextNode("Almost Done!"));

    //var gameCreationForm = document.getElementById("modal_header_text");
    $("#game_creation_form").hide();

    var modalBody = document.getElementById("modal_body_text");
    modalBody.innerHTML = "";
    modalBody.appendChild(document.createTextNode(
      `Click the button to create a game and share it in the arcade.`
    ));

    $('#game_start_options').innerHTML = '';
    $('#game_start_options').html(`
      <div class="game_options_grid_container">
        <div class="advanced_game_options" style="display:none">
          <h4 class="advanced_options_header">Options</h4>
          <div class="sms_input_container" >
            ${this.countryCodeNumbersSelector()}
            <input class="opponent_address player_sms" id="player_sms"></input>
          </div>
          <p class="sms_explanation_text">SMS me when another player accepts the game</p>
          <div class="game_timer_select_container">
            <div>Invitation Valid For:</div>
            <select id="invitation_valid_for" class="invitation_valid_for">
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="120">2 hour</option>
              <option value="240">4 hour</option>
            </select>
          </div>
        </div>
        ${this.renderModalOptions("open")}
      </div>

      <div class="advanced_menu_hidden" onclick="$(&quot;.advanced_game_options&quot;).show();$(this).html(&quot; &quot;);">
        advanced
      </div>
    `);
    //
    //<span style="margin-right: 15px">SMS:</span>
    //<button id="send_sms_notification" style="margin: 0" class="quick_invite">SEND</button>
  }

  createOpenGameSuccess() {
    var modal = document.getElementById("game_modal");
    modal.style.display = "block";

    var modalTitle = document.getElementById("modal_header_text");
    modalTitle.innerHTML = "";
    modalTitle.appendChild(document.createTextNode("Success"));

    //var gameCreationForm = document.getElementById("modal_header_text");
    $("#game_creation_form").hide();

    var modalBody = document.getElementById("modal_body_text");
    modalBody.innerHTML = "";
    modalBody.appendChild(
      document.createTextNode(
        `Your game has been created! Please stay on this page while waiting.
        It might take a couple of minutes to find an opponent`
      )
    );

    $('#game_start_options').html('');

    //let gameSelectHTML = this.renderModalOptions("link");
    // $('#game_start_options').innerHTML = '';
    // $('#game_start_options').html(`
    //   <div style="display: grid; width: 100%; row-gap: 1em">
    //     <div style="display: flex; align-items: center; width: 67%;">
    //       <span style="margin-right: 15px">SMS:</span>
    //       <input class="opponent_address" id="player_sms"></input>
    //     </div>
    //     <button id="send_sms_notification" style="margin: 0" class="quick_invite">SEND</button>
    //   </div>
    // `);
  }

  inviteByLinkModal() {
    var modal = document.getElementById("game_modal");
    modal.style.display = "block";

    $('#modal_header_text').html('Invite a Friend');
    $('#modal_body_text').html(
      `<p>This is your invite link. Send this link to your friend to start the game. </p>
      <a id="invite_by_publickey" style="text-decoration: underline; cursor: pointer; font-size: 0.75em; color: lightgrey">Invite them with their publickey</a>`
    );

    $("#game_creation_form").show();

    let gameSelectHTML = this.renderModalOptions("link");
    $('#game_start_options').innerHTML = '';
    $('#game_start_options').html(gameSelectHTML);
  }

  inviteByPublickeyModal() {
    var modal = document.getElementById("game_modal");
    modal.style.display = "block";

    $('#modal_header_text').html('Invite a Friend');
    $('#modal_body_text').html(
      `<p>Enter your opponent(s) publickey(s) to invite them.</p>
       <a id="invite_by_link" style="color: lightgrey; font-size: 0.75em; text-decoration: underline; cursor: pointer">Or send them a link</a>`
    );

    $("#game_creation_form").show();

    let gameSelectHTML = this.renderModalOptions("key");
    $('#game_start_options').innerHTML = '';
    $('#game_start_options').html(gameSelectHTML);
  }

  showForumPostModal() {
    var modal = document.getElementById("game_modal");
    modal.style.display = "block";

    $('#modal_header_text').html('New Forum Post');
    $('#modal_body_text').html(
      `
      <div id="submit_post" class="submit_post">
        <div for="submit_title" class="submit_title_label" id="submit_title_label">title:</div>
        <input type="text" class="submit_title" id="submit_title" name="submit_title" />
        <div for="submit_link" class="submit_link_label" id="submit_link_label">url: <span style="font-size:0.9em"><i>(optional)</i></span> [<a href="https://imgur.com/upload" onclick="window.open(this.href, 'mywin', 'left=20,top=20,width=800,height=600,toolbar=1,resizable=0'); return false;" id="image_upload" class="image_upload">upload image</a>]</div>
        <input type="text" class="submit_link" id="submit_link" name="submit_link" />
        <div for="submit_text" class="submit_text_label" id="submit_text_label">discussion:</div>
        <div class="toggle-preview-text" style=""></div>
        <textarea class="submit_text" id="submit_text" name="submit_text"></textarea>
        <button class="toggle_post_button">toggle preview</button>
        <div for="submit_r" class="submit_r_label" id="submit_r_label">subreddit:</div>
        <input type="text" class="submit_r" id="submit_r" name="submit_r" />
        <input type="button" class="submit_button" id="submit_button" value="POST" />
      </div>
      `
    );
  }

  showRegModal() {
    var modal = document.getElementById("game_modal");
    modal.style.display = "block";

    // style="display: flex; align-items: center;"

    $('#modal_header_text').html('Register Saito ID');
    $('#modal_body_text').html(
      `
      <div id="submit_post" class="submit_post">
        <p>Submit a unique name for your Saito ID</p>
        <div class="arcade_registry_form">
          <input id="arcade_registry_input" type="text" class="reg_id" id="reg_id" name="reg_id" />
          <p>@saito</p>
          <input id="arcade_reg_button" class="submit_button" value="SUBMIT"/>
        </div>
      </div>
      `
    );
  }




  ////////////////
  // Web Server //
  ////////////////
  webServer(app, expressapp) {

    let arcade_self = this;

    expressapp.get('/arcade/',  (req, res) => {
      res.sendFile(__dirname + '/web/index.html');
      return;
    });

    expressapp.get('/arcade/email',  (req, res) => {
      res.sendFile(__dirname + '/web/email.html');
      return;
    });

    expressapp.get('/arcade/invite/:gameinvite',  (req, res) => {

      let gameinvite = req.params.gameinvite;
      let txmsgstr = "";

      if (gameinvite != null) {
        txmsgstr = app.crypto.base64ToString(gameinvite);
      }

      let data = fs.readFileSync(__dirname + '/web/invite.html', 'utf8', (err, data) => {});
      data = data.replace('GAME_INVITATION', txmsgstr);
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      res.write(data);
      res.end();
      return;
    });

    expressapp.get('/arcade/invite.css',  (req, res) => {
      res.sendFile(__dirname + '/web/invite.css');
      return;
    });

    expressapp.get('/arcade/style.css',  (req, res) => {
      res.sendFile(__dirname + '/web/style.css');
      return;
    });

    expressapp.get('/arcade/script.js',  (req, res) => {
      res.sendFile(__dirname + '/web/script.js');
      return;
    });

    expressapp.get('/arcade/opengames', async (req, res) => {

      var sql    = "SELECT * FROM mod_arcade WHERE state = 'open' AND expires_at > $expires_at";
      var params = { $expires_at : new Date().getTime() };

      var open_games = await this.db.all(sql, params);
      var structured_open_games = open_games.map((game) => {
        let gameid     = "";
        let adminid    = "";
        let winner     = "";
        let options    = "";
        let sig        = "";
        let created_at = 0;
        let expires_at = 0;

        if (game.gameid != undefined && game.gameid != "") {
          gameid = game.gameid;
          adminid = `${game.gameid}_${game.game}`;
        }

        if (game.winner != undefined && game.winner != "") {
          winner = game.winner;
        }

        if (game.options != undefined && game.options != "") {
          options = game.options;
        }

        if (game.sig != undefined && game.sig != "") {
          sig = game.sig;
        }

        if (game.created_at > 0) {
          created_at = game.created_at;
        }

        if (game.expires_at > 0) {
          expires_at = game.expires_at;
        }

        return {
          player: game.player ,
          winner : winner,
          game: game.game,
          state : game.state,
          status : "",
          options : options ,
          sig : sig,
          created_at : created_at,
          expires_at : expires_at,
          gameid : gameid,
          adminid : adminid
        };
      });

      res.send({
        payload: structured_open_games,
        err: {}
      });
    });

    expressapp.get('/arcade/img/:imagefile',  (req, res) => {
      var imgf = '/web/img/'+req.params.imagefile;
      if (imgf.indexOf("\/") != false) { return; }
      res.sendFile(__dirname + imgf);
      return;
    });



    expressapp.get('/arcade/restore/:game_id/:player_pkey', async (req, res) => {

      var sql    = "SELECT * FROM mod_games WHERE game_id = $game_id ORDER BY id DESC LIMIT 10";
      var params = { $game_id : req.params.game_id }
      var games = await this.db.all(sql, params);

      let stop_now = 0;
      let games_to_push = [];

      let recovering_pkey = "";
      try {
        if (req.params.player_pkey != undefined) { recovering_pkey = req.params.pkayer_pkey; }
      } catch (err) {}


      if (games.length > 0) {

	for (let z = 0; z < games.length; z++) {
	  let game = games[z];
	  if (game.player_pkey == recovering_pkey) { stop_now = 1; } else { games_to_push.push(game.state); }
	  if (recovering_pkey == "" || stop_now == 1) { z = games.length+1; }
	}

        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        res.write(JSON.stringify(games_to_push));
        res.end();
        return;
      }

    });

    expressapp.get('/arcade/keystate/:game_id/:player_pkey', async (req, res) => {

      var sql    = "SELECT * FROM mod_games WHERE game_id = $game_id AND player_pkey = $playerpkey ORDER BY id DESC LIMIT 1";
      var params = { 
        $game_id : req.params.game_id ,
	$playerpkey : req.params.player_pkey
      }

      var games = await this.db.all(sql, params);

console.log("GID & PKEY: " + req.params.game_id + " -- " + req.params.player_pkey);
console.log("WE FOUND TOTAL OF: " + games.length);
      if (games.length > 0) {

	let game = games[0];
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
console.log("writing 0: " + game.id);
console.log("writing 1: " + game.state);
console.log("writing 2: " + game.key_state);
        res.write(game.key_state);
        res.end();
        return;
	
      }

console.log("GOT THROUGH TO HERE!");

    });

    expressapp.get('/arcade/observer/:game_id', async (req, res) => {

      var sql    = "SELECT * FROM mod_games WHERE game_id = $game_id ORDER BY id DESC LIMIT 1";
      var params = { $game_id : req.params.game_id }

      var games = await this.db.all(sql, params);

      if (games.length > 0) {

	let game = games[0];
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        res.write(game.state);
        res.end();
        return;
	
      }

    });




  }

  _createGameNotification(title, message, onClickFunction) {
    let notify = this.app.browser.notification(title, message);
    if (notify) {
      notify.onclick = onClickFunction;
    }
  }

  _onclickGameNotification() {
    window.focus();
  }


  async refreshOpenGames() {

console.log("REFRESHING OPEN GAMES");

    if (this.app.BROWSER == 0) {

      var sql    = "SELECT * FROM mod_arcade WHERE state = 'open' and expires_at > $expires_at";
      var params = { $expires_at : new Date().getTime() };
      try {
        var rows = await this.db.all(sql, params);
      } catch(err) {
        console.log(err);
console.log("ERROR REFRESHING: " + err);
        return;
      }

      this.games.open = [];

      if (rows != null) {
        if (rows.length != 0) {
          for (var fat = 0; fat < rows.length; fat++) {
            this.games.open[fat] = {};
            this.games.open[fat].gameid     = rows[fat].gameid;
            this.games.open[fat].player     = rows[fat].player;
            this.games.open[fat].state      = rows[fat].state;
            this.games.open[fat].game_bid   = rows[fat].game_bid;
            this.games.open[fat].game       = rows[fat].game;
            this.games.open[fat].created_at = rows[fat].created_at;
            this.games.open[fat].expires_at = rows[fat].created_at + 6000000;
            this.games.open[fat].options    = `${JSON.stringify(rows[fat].options)}`;
            this.games.open[fat].sig        = rows[fat].sig;
          }
        }
      }
    }
  }


  showArcadeHome() {
    $('.gamelist').show();
    $('#arcade_container').show();
    $('#games').show();
    $('.game_options').show();
  }



  showGameCreator() {
    this.viewing_game_creator = 1;

    let game_options = "";
    let game_self = this.app.modules.returnModule(this.active_game);
    if (this.active_game != "") {
      if (game_self != null) {
        game_options = game_self.returnGameOptionsHTML();
      }
    }

    $('#game_creation_image').attr('src', `/arcade/img/${game_self.name.toLowerCase()}.jpg`);
    $('.game_description').html(game_self.description);
    $('.game_details').html(game_options);

    this.updateBalance(this.app);

    $('.game_monitor').slideDown(500, function() {});

    $('.find_player_button').show();
    $('.create_game_container').show();

    if (game_self.name == "Twilight" || game_self.name == "Pandemic") {
      $('.publisher_message').show();
    } else {
      $('.publisher_message').hide();
    }

    if (this.browser_active == 1) { this.attachEvents(this.app); }

    this.attachEvents();
  }

  showGameInitializer() {

    this.viewing_game_initializer = 1;

    $('.game_monitor').slideDown(500, function() {});
    $('.gamelist').hide();
    $('#arcade_container').hide();
    $('#games').hide();
    $('.game_options').hide();

    $('.modal').hide();

    $('.initialize_game_container').show();
    $('#game_spinner').show();

    if (this.browser_active == 1) { this.attachEvents(this.app); }
  }

  hideGameInitializer() {
    this.viewing_game_initializer = 0;
    $('.create_game_initializer').hide();
    $('.gamelist').show();
    $('.game_options').show();
    $('.game_monitor').hide();
  }

  hideArcadeHome() {
    $('.gamelist').hide();
    $('#arcade_container').hide();
    $('#games').hide();
    $('.game_options').hide();
  }


  hideGameCreator() {
    this.viewing_game_creator = 0;
    $('.create_game_container').hide();
    $('.find_player_button').hide();
    // $('.gamelist').show();
    // $('.game_options').show();
    $('.game_monitor').hide();
  }

  invitePlayButtonClicked() {
    $('#token-success').hide();
    $('#token_spinner').hide();
    $('.invite_play_button').hide();
    $('.get_tokens_button').hide();
    $('.ads').hide();
    $('.manage_invitations').css('font-size','1.4em');
    $('.status').css('font-size','1.25em');
    $('.invite_description').html(`Your game is initializing with your opponent.<br /><br />Please do not leave this page`);
    $('#game_spinner').show();
  }



  renderModalOptions(option) {
    let game_module = this.app.modules.returnModule(this.active_game);
    let options = {};
    let txmsg = {};
    let base64str = "";

    switch(option) {
      case 'open':
        return `<button id="create_game_button" style="margin: 0" class="quick_invite">CREATE GAME</button>`
      case 'link':
        $('form input, form select').each(
          function(index) {
            var input = $(this);
            if (input.is(":checkbox")) {
              if (input.prop("checked")) {
                options[input.attr('name')] = 1;
              }
            } else {
              options[input.attr('name')] = input.val();
            }
          }
        );

        options = game_module.returnQuickLinkGameOptions(options);

        txmsg.module = this.active_game;
        txmsg.pubkey = this.app.wallet.returnPublicKey();
        txmsg.options = options;
        txmsg.ts = new Date().getTime();
        txmsg.sig = this.app.wallet.signMessage(txmsg.ts.toString(), this.app.wallet.returnPrivateKey());

        base64str = this.app.crypto.stringToBase64(JSON.stringify(txmsg));

        return `<input class="quick_link_input" value="${window.location.href}/invite/${base64str}" />
        <button class="quick_invite" id="copy_quick_link_button" style="margin: 0"> COPY</button>`
      case 'chat_link':
         $('form input, form select').each(
            function(index) {
              var input = $(this);
              if (input.is(":checkbox")) {
                if (input.prop("checked")) {
                  options[input.attr('name')] = 1;
                }
              } else {
                options[input.attr('name')] = input.val();
              }
            }
          );
  
          options = game_module.returnQuickLinkGameOptions(options);
  
          txmsg.module = this.active_game;
          txmsg.pubkey = this.app.wallet.returnPublicKey();
          txmsg.options = options;
          txmsg.ts = new Date().getTime();
          txmsg.sig = this.app.wallet.signMessage(txmsg.ts.toString(), this.app.wallet.returnPrivateKey());
  
          base64str = this.app.crypto.stringToBase64(JSON.stringify(txmsg));
            
          return `<a id="${txmsg.ts + (5*60*1000)}" class="quick_link_button chat_invite live_invite" href="${window.location.href}/invite/${base64str}" />${(game_module.name)}</a>`
      case 'key':
        let selectedGameModule = this.app.modules.returnModule(this.active_game);
        let html = `<div class="opponent_key_container">`
        for (let i = 0; i < selectedGameModule.maxPlayers - 1; i++) {
          html += `
          <div class="invite_a_friend_container">
            <span>OPPONENT ${i + 1}:</span>
            <input class="opponent_address" id=${i}></input>
          </div>`
          //style="margin-right: 15px;width: 25%"
        }
        html += `<button style="margin: 0" class="quick_invite" id="invite_button"> INVITE</button>`;
        html += "</div>";
        return html;
      default:
        break;
    }
  }

  countryCodeNumbersSelector() {
    return `
      <select name="country_code" id="country_code" class="country_code" style="width:180px; margin-right: 5px;">
        <option data-countryCode="CN" value="86" selected>China (+86)</option>
        <option data-countryCode="US" value="1">USA (+1)</option>
        <option data-countryCode="VE" value="58">Venezuela (+58)</option>
        <optgroup label="Other countries">
          <option data-countryCode="DZ" value="213">Algeria (+213)</option>
          <option data-countryCode="AD" value="376">Andorra (+376)</option>
          <option data-countryCode="AO" value="244">Angola (+244)</option>
          <option data-countryCode="AI" value="1264">Anguilla (+1264)</option>
          <option data-countryCode="AG" value="1268">Antigua &amp; Barbuda (+1268)</option>
          <option data-countryCode="AR" value="54">Argentina (+54)</option>
          <option data-countryCode="AM" value="374">Armenia (+374)</option>
          <option data-countryCode="AW" value="297">Aruba (+297)</option>
          <option data-countryCode="AU" value="61">Australia (+61)</option>
          <option data-countryCode="AT" value="43">Austria (+43)</option>
          <option data-countryCode="AZ" value="994">Azerbaijan (+994)</option>
          <option data-countryCode="BS" value="1242">Bahamas (+1242)</option>
          <option data-countryCode="BH" value="973">Bahrain (+973)</option>
          <option data-countryCode="BD" value="880">Bangladesh (+880)</option>
          <option data-countryCode="BB" value="1246">Barbados (+1246)</option>
          <option data-countryCode="BY" value="375">Belarus (+375)</option>
          <option data-countryCode="BE" value="32">Belgium (+32)</option>
          <option data-countryCode="BZ" value="501">Belize (+501)</option>
          <option data-countryCode="BJ" value="229">Benin (+229)</option>
          <option data-countryCode="BM" value="1441">Bermuda (+1441)</option>
          <option data-countryCode="BT" value="975">Bhutan (+975)</option>
          <option data-countryCode="BO" value="591">Bolivia (+591)</option>
          <option data-countryCode="BA" value="387">Bosnia Herzegovina (+387)</option>
          <option data-countryCode="BW" value="267">Botswana (+267)</option>
          <option data-countryCode="BR" value="55">Brazil (+55)</option>
          <option data-countryCode="BN" value="673">Brunei (+673)</option>
          <option data-countryCode="BG" value="359">Bulgaria (+359)</option>
          <option data-countryCode="BF" value="226">Burkina Faso (+226)</option>
          <option data-countryCode="BI" value="257">Burundi (+257)</option>
          <option data-countryCode="KH" value="855">Cambodia (+855)</option>
          <option data-countryCode="CM" value="237">Cameroon (+237)</option>
          <option data-countryCode="CA" value="1">Canada (+1)</option>
          <option data-countryCode="CV" value="238">Cape Verde Islands (+238)</option>
          <option data-countryCode="KY" value="1345">Cayman Islands (+1345)</option>
          <option data-countryCode="CF" value="236">Central African Republic (+236)</option>
          <option data-countryCode="CL" value="56">Chile (+56)</option>
          <option data-countryCode="CO" value="57">Colombia (+57)</option>
          <option data-countryCode="KM" value="269">Comoros (+269)</option>
          <option data-countryCode="CG" value="242">Congo (+242)</option>
          <option data-countryCode="CK" value="682">Cook Islands (+682)</option>
          <option data-countryCode="CR" value="506">Costa Rica (+506)</option>
          <option data-countryCode="HR" value="385">Croatia (+385)</option>
          <option data-countryCode="CU" value="53">Cuba (+53)</option>
          <option data-countryCode="CY" value="90392">Cyprus North (+90392)</option>
          <option data-countryCode="CY" value="357">Cyprus South (+357)</option>
          <option data-countryCode="CZ" value="42">Czech Republic (+42)</option>
          <option data-countryCode="DK" value="45">Denmark (+45)</option>
          <option data-countryCode="DJ" value="253">Djibouti (+253)</option>
          <option data-countryCode="DM" value="1809">Dominica (+1809)</option>
          <option data-countryCode="DO" value="1809">Dominican Republic (+1809)</option>
          <option data-countryCode="EC" value="593">Ecuador (+593)</option>
          <option data-countryCode="EG" value="20">Egypt (+20)</option>
          <option data-countryCode="SV" value="503">El Salvador (+503)</option>
          <option data-countryCode="GQ" value="240">Equatorial Guinea (+240)</option>
          <option data-countryCode="ER" value="291">Eritrea (+291)</option>
          <option data-countryCode="EE" value="372">Estonia (+372)</option>
          <option data-countryCode="ET" value="251">Ethiopia (+251)</option>
          <option data-countryCode="FK" value="500">Falkland Islands (+500)</option>
          <option data-countryCode="FO" value="298">Faroe Islands (+298)</option>
          <option data-countryCode="FJ" value="679">Fiji (+679)</option>
          <option data-countryCode="FI" value="358">Finland (+358)</option>
          <option data-countryCode="FR" value="33">France (+33)</option>
          <option data-countryCode="GF" value="594">French Guiana (+594)</option>
          <option data-countryCode="PF" value="689">French Polynesia (+689)</option>
          <option data-countryCode="GA" value="241">Gabon (+241)</option>
          <option data-countryCode="GM" value="220">Gambia (+220)</option>
          <option data-countryCode="GE" value="7880">Georgia (+7880)</option>
          <option data-countryCode="DE" value="49">Germany (+49)</option>
          <option data-countryCode="GH" value="233">Ghana (+233)</option>
          <option data-countryCode="GI" value="350">Gibraltar (+350)</option>
          <option data-countryCode="GR" value="30">Greece (+30)</option>
          <option data-countryCode="GL" value="299">Greenland (+299)</option>
          <option data-countryCode="GD" value="1473">Grenada (+1473)</option>
          <option data-countryCode="GP" value="590">Guadeloupe (+590)</option>
          <option data-countryCode="GU" value="671">Guam (+671)</option>
          <option data-countryCode="GT" value="502">Guatemala (+502)</option>
          <option data-countryCode="GN" value="224">Guinea (+224)</option>
          <option data-countryCode="GW" value="245">Guinea - Bissau (+245)</option>
          <option data-countryCode="GY" value="592">Guyana (+592)</option>
          <option data-countryCode="HT" value="509">Haiti (+509)</option>
          <option data-countryCode="HN" value="504">Honduras (+504)</option>
          <option data-countryCode="HK" value="852">Hong Kong (+852)</option>
          <option data-countryCode="HU" value="36">Hungary (+36)</option>
          <option data-countryCode="IS" value="354">Iceland (+354)</option>
          <option data-countryCode="IN" value="91">India (+91)</option>
          <option data-countryCode="ID" value="62">Indonesia (+62)</option>
          <option data-countryCode="IR" value="98">Iran (+98)</option>
          <option data-countryCode="IQ" value="964">Iraq (+964)</option>
          <option data-countryCode="IE" value="353">Ireland (+353)</option>
          <option data-countryCode="IL" value="972">Israel (+972)</option>
          <option data-countryCode="IT" value="39">Italy (+39)</option>
          <option data-countryCode="JM" value="1876">Jamaica (+1876)</option>
          <option data-countryCode="JP" value="81">Japan (+81)</option>
          <option data-countryCode="JO" value="962">Jordan (+962)</option>
          <option data-countryCode="KZ" value="7">Kazakhstan (+7)</option>
          <option data-countryCode="KE" value="254">Kenya (+254)</option>
          <option data-countryCode="KI" value="686">Kiribati (+686)</option>
          <option data-countryCode="KP" value="850">Korea North (+850)</option>
          <option data-countryCode="KR" value="82">Korea South (+82)</option>
          <option data-countryCode="KW" value="965">Kuwait (+965)</option>
          <option data-countryCode="KG" value="996">Kyrgyzstan (+996)</option>
          <option data-countryCode="LA" value="856">Laos (+856)</option>
          <option data-countryCode="LV" value="371">Latvia (+371)</option>
          <option data-countryCode="LB" value="961">Lebanon (+961)</option>
          <option data-countryCode="LS" value="266">Lesotho (+266)</option>
          <option data-countryCode="LR" value="231">Liberia (+231)</option>
          <option data-countryCode="LY" value="218">Libya (+218)</option>
          <option data-countryCode="LI" value="417">Liechtenstein (+417)</option>
          <option data-countryCode="LT" value="370">Lithuania (+370)</option>
          <option data-countryCode="LU" value="352">Luxembourg (+352)</option>
          <option data-countryCode="MO" value="853">Macao (+853)</option>
          <option data-countryCode="MK" value="389">Macedonia (+389)</option>
          <option data-countryCode="MG" value="261">Madagascar (+261)</option>
          <option data-countryCode="MW" value="265">Malawi (+265)</option>
          <option data-countryCode="MY" value="60">Malaysia (+60)</option>
          <option data-countryCode="MV" value="960">Maldives (+960)</option>
          <option data-countryCode="ML" value="223">Mali (+223)</option>
          <option data-countryCode="MT" value="356">Malta (+356)</option>
          <option data-countryCode="MH" value="692">Marshall Islands (+692)</option>
          <option data-countryCode="MQ" value="596">Martinique (+596)</option>
          <option data-countryCode="MR" value="222">Mauritania (+222)</option>
          <option data-countryCode="YT" value="269">Mayotte (+269)</option>
          <option data-countryCode="MX" value="52">Mexico (+52)</option>
          <option data-countryCode="FM" value="691">Micronesia (+691)</option>
          <option data-countryCode="MD" value="373">Moldova (+373)</option>
          <option data-countryCode="MC" value="377">Monaco (+377)</option>
          <option data-countryCode="MN" value="976">Mongolia (+976)</option>
          <option data-countryCode="MS" value="1664">Montserrat (+1664)</option>
          <option data-countryCode="MA" value="212">Morocco (+212)</option>
          <option data-countryCode="MZ" value="258">Mozambique (+258)</option>
          <option data-countryCode="MN" value="95">Myanmar (+95)</option>
          <option data-countryCode="NA" value="264">Namibia (+264)</option>
          <option data-countryCode="NR" value="674">Nauru (+674)</option>
          <option data-countryCode="NP" value="977">Nepal (+977)</option>
          <option data-countryCode="NL" value="31">Netherlands (+31)</option>
          <option data-countryCode="NC" value="687">New Caledonia (+687)</option>
          <option data-countryCode="NZ" value="64">New Zealand (+64)</option>
          <option data-countryCode="NI" value="505">Nicaragua (+505)</option>
          <option data-countryCode="NE" value="227">Niger (+227)</option>
          <option data-countryCode="NG" value="234">Nigeria (+234)</option>
          <option data-countryCode="NU" value="683">Niue (+683)</option>
          <option data-countryCode="NF" value="672">Norfolk Islands (+672)</option>
          <option data-countryCode="NP" value="670">Northern Marianas (+670)</option>
          <option data-countryCode="NO" value="47">Norway (+47)</option>
          <option data-countryCode="OM" value="968">Oman (+968)</option>
          <option data-countryCode="PW" value="680">Palau (+680)</option>
          <option data-countryCode="PA" value="507">Panama (+507)</option>
          <option data-countryCode="PG" value="675">Papua New Guinea (+675)</option>
          <option data-countryCode="PY" value="595">Paraguay (+595)</option>
          <option data-countryCode="PE" value="51">Peru (+51)</option>
          <option data-countryCode="PH" value="63">Philippines (+63)</option>
          <option data-countryCode="PL" value="48">Poland (+48)</option>
          <option data-countryCode="PT" value="351">Portugal (+351)</option>
          <option data-countryCode="PR" value="1787">Puerto Rico (+1787)</option>
          <option data-countryCode="QA" value="974">Qatar (+974)</option>
          <option data-countryCode="RE" value="262">Reunion (+262)</option>
          <option data-countryCode="RO" value="40">Romania (+40)</option>
          <option data-countryCode="RU" value="7">Russia (+7)</option>
          <option data-countryCode="RW" value="250">Rwanda (+250)</option>
          <option data-countryCode="SM" value="378">San Marino (+378)</option>
          <option data-countryCode="ST" value="239">Sao Tome &amp; Principe (+239)</option>
          <option data-countryCode="SA" value="966">Saudi Arabia (+966)</option>
          <option data-countryCode="SN" value="221">Senegal (+221)</option>
          <option data-countryCode="CS" value="381">Serbia (+381)</option>
          <option data-countryCode="SC" value="248">Seychelles (+248)</option>
          <option data-countryCode="SL" value="232">Sierra Leone (+232)</option>
          <option data-countryCode="SG" value="65">Singapore (+65)</option>
          <option data-countryCode="SK" value="421">Slovak Republic (+421)</option>
          <option data-countryCode="SI" value="386">Slovenia (+386)</option>
          <option data-countryCode="SB" value="677">Solomon Islands (+677)</option>
          <option data-countryCode="SO" value="252">Somalia (+252)</option>
          <option data-countryCode="ZA" value="27">South Africa (+27)</option>
          <option data-countryCode="ES" value="34">Spain (+34)</option>
          <option data-countryCode="LK" value="94">Sri Lanka (+94)</option>
          <option data-countryCode="SH" value="290">St. Helena (+290)</option>
          <option data-countryCode="KN" value="1869">St. Kitts (+1869)</option>
          <option data-countryCode="SC" value="1758">St. Lucia (+1758)</option>
          <option data-countryCode="SD" value="249">Sudan (+249)</option>
          <option data-countryCode="SR" value="597">Suriname (+597)</option>
          <option data-countryCode="SZ" value="268">Swaziland (+268)</option>
          <option data-countryCode="SE" value="46">Sweden (+46)</option>
          <option data-countryCode="CH" value="41">Switzerland (+41)</option>
          <option data-countryCode="SI" value="963">Syria (+963)</option>
          <option data-countryCode="TW" value="886">Taiwan (+886)</option>
          <option data-countryCode="TJ" value="7">Tajikstan (+7)</option>
          <option data-countryCode="TH" value="66">Thailand (+66)</option>
          <option data-countryCode="TG" value="228">Togo (+228)</option>
          <option data-countryCode="TO" value="676">Tonga (+676)</option>
          <option data-countryCode="TT" value="1868">Trinidad &amp; Tobago (+1868)</option>
          <option data-countryCode="TN" value="216">Tunisia (+216)</option>
          <option data-countryCode="TR" value="90">Turkey (+90)</option>
          <option data-countryCode="TM" value="7">Turkmenistan (+7)</option>
          <option data-countryCode="TM" value="993">Turkmenistan (+993)</option>
          <option data-countryCode="TC" value="1649">Turks &amp; Caicos Islands (+1649)</option>
          <option data-countryCode="TV" value="688">Tuvalu (+688)</option>
          <option data-countryCode="UG" value="256">Uganda (+256)</option>
          <option data-countryCode="GB" value="44">UK (+44)</option>
          <option data-countryCode="UA" value="380">Ukraine (+380)</option>
          <option data-countryCode="AE" value="971">United Arab Emirates (+971)</option>
          <option data-countryCode="UY" value="598">Uruguay (+598)</option>
          <!-- <option data-countryCode="US" value="1">USA (+1)</option> -->
          <option data-countryCode="UZ" value="7">Uzbekistan (+7)</option>
          <option data-countryCode="VU" value="678">Vanuatu (+678)</option>
          <option data-countryCode="VA" value="379">Vatican City (+379)</option>
          <option data-countryCode="VN" value="84">Vietnam (+84)</option>
          <option data-countryCode="VG" value="84">Virgin Islands - British (+1284)</option>
          <option data-countryCode="VI" value="84">Virgin Islands - US (+1340)</option>
          <option data-countryCode="WF" value="681">Wallis &amp; Futuna (+681)</option>
          <option data-countryCode="YE" value="969">Yemen (North)(+969)</option>
          <option data-countryCode="YE" value="967">Yemen (South)(+967)</option>
          <option data-countryCode="ZM" value="260">Zambia (+260)</option>
          <option data-countryCode="ZW" value="263">Zimbabwe (+263)</option>
        </optgroup>
      </select>
    `
  }



  populateGamesTable() {

    //
    // add games to table
    //
    if (this.app.options.games != undefined) {
      if (this.app.options.games.length > 0) {

        for (let i = 0; i < this.app.options.games.length; i++) {

          let x = this.app.options.games[i];

          let opponent   = "unknown";
          let identifier = null;
          let gameid     = x.id;
          let player     = x.player;
          let winner     = x.winner;
          let gamename   = x.module;
          let options    = x.options;
          let state      = 'active';
          let status     = x.status;
	  if (status != "") { status = status.replace(/<[^>]*>?/gm, ''); }

          let adminid    = `${gameid}_${gamename}`;
          let created_at = x.ts;
          let sig        = x.sig;

          if (x.id == undefined || x.id === "") {
            gameid = "";
            adminid = "";
          }

          if (x.opponents != undefined) {
              if (x.opponents.length > 0) {
               opponent = x.opponents[0];
              }
          }


          if (x.initializing != 1) { state = "active"; }
          if (x.accept == 0) { state = "invited"; }
          if (x.over == 1) {
            state = "over";
            if (x.last_block > 0) {
              state = "deleted";
            }
          }


          let id = this.app.keys.findByPublicKey(opponent);
          if (id != null) {
            if (id.identifiers[0] !== "") { identifier = id.identifiers[0]; }
          }
          if (opponent.length > 14 && this.app.crypto.isPublicKey(opponent) == 1) { opponent = opponent.substring(0, 13) + "..."; }
          if (status.length > 50) { status = status.substring(0, 50) + "..."; }

          let remote_address = "";
          for (let z = 0; z < x.opponents.length; z++) {;
            if (z > 0) { remote_address += "_"; }
            remote_address += x.opponents[z];
          }

	  //
	  // purge old invitations which have not been accepted
	  // 
          let datenow = new Date().getTime();
	        let duration = datenow - created_at;
          var milliseconds = parseInt((duration % 1000) / 100),
              seconds = Math.floor((duration / 1000) % 60),
              minutes = Math.floor((duration / (1000 * 60)) % 60),
              hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

          if (minutes > 60) {
	    state = "expired";
	    status = "invitation expired";
	  }

          this.games.open.push({
            player: opponent ,
            identifier: identifier,
            winner : winner ,
            game: gamename ,
            state : state ,
            status : status ,
            options : options ,
            created_at : created_at ,
            sig : sig ,
            gameid : gameid ,
            adminid : adminid
          });
        }
      }
    }
  }

}



module.exports = Arcade;


