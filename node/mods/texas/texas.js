const GameTableTemplate = require('../../lib/templates/table-gametemplate');
const JSON = require('json-bigint');
const PokerStats = require('./lib/stats');
const GameRulesTemplate = require('./lib/core/game-rules.template');
const GameOptionsTemplate = require('./lib/core/game-options.template');
const Main = require('./lib/ui/main');

const PokerState = require('./lib/poker-state.js');
const PokerStake = require('./lib/poker-stake.js');
const PokerQueue = require('./lib/poker-queue.js');
const PokerUI = require('./lib/poker-ui.js');
const PokerCards = require('./lib/poker-cards.js');

//////////////////
// CONSTRUCTOR  //
//////////////////
class Texas extends GameTableTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.name = 'Poker';
    this.slug = 'texas';
    this.title = 'Saito Texas';
    this.description = `Texas Hold\'em Poker for the Saito Arcade. With five cards on the table and two in your hand, can you bet and bluff your way to victory? 
				<br> Play with up to five other players for fun or wager integrated web3 cryptocurrencies through your handy Saito Wallets`;
    this.categories = 'Games Cardgame Casino';
    this.card_img_dir = '/hearts/img/cards';
    this.card_back = '/texas/img/cards/red.png';
    this.felt = 'green';
    this.theme = 'threed';
    this.icon = 'fa-solid fa-diamond';

    this.useHUD = 0;
    this.minPlayers = 2;
    this.maxPlayers = 6;

    this.stats = new PokerStats(app, this);
    this.main = new Main(app, this);
    this.board = this.main.table.board;
    this.hand = this.main.table.hand;
    this.controls = this.main.table.controls;
    this.sidebar = this.main.sidebar;
    this.playerbox = this.sidebar;
    this.pot = this.sidebar.pot;
    this.cardfan = this.hand;

    /********************
		*********************
		*********************
		***
		*** CRYPTO *NEEDS* to be in a string, but the internal math/logic of the game is a lot less bug-ridden
		*** if we _secretly_ make all games use 100 chip buy ins, with all bets as whole numbers of chips... 
		*** so everything -- the blind, the pot, the debt, the credit is a whole number... 
		*** If there is a stake, such as 32 TRX or 0.005 BTC, we divide that by 100, and multiply by the whole numbers
		*** when rendering UI or initiating transfers.
		*** Stake 250.67 SAITO --> x = 2.5067 SAITO. Bets are in increments of 2.5067 SAITO, e.g. 1x, 2x, 3x ...  
		***
		***
		this.game.crypto;       // (STRING) TICKER of crypto or "CHIPS" in standard game
		this.game.stake;        // (STRING) TOTAL crypto buy-in OR 100 (if chips)
		this.game.chips;        // (INTEGER) TOTAL CHIPS per buy-in,
		this.game.blind_mode;     // (STRING) "static" or "increase"
   
   
		this.game.state.round;    // (INT) round in game
		this.game.state.big_blind;    // (INTEGER) value of big-blind
		this.game.state.small_blind;  // (INTEGER) value of small-blind
		this.game.state.last_raise;   // (INTEGER) value of last raise
		this.game.state.required_pot; // (INTEGER) value players need in pot to keep playing
   
		this.game.state.passed[i];    // (INT) 1 = has passed
		this.game.state.player_pot[i];  // (INTEGER) value contributed to pot
		this.game.state.debt[i];    // (INTEGER) amount due
		this.game.state.player_credit[i]; // (INTEGER) bankroll
		*********************
		*********************
		********************/

    this.updateHTML = '';

    this.sort_priority = 1;
  }

  initializeGame() {
    super.initializeGame();

    this.settleNow = false;
    this.settle_every_hand = false;

    if (this.game.player == 0) {
      if (!this.game.pool[0]) {
        this.addPool();
      }
    }

    if (!this.game?.state) {
      this.game.state = this.returnState(this.game.players.length);
      this.initializeGameStake(this.game.crypto, this.game.stake);
      this.game.stats = this.returnStats();
      this.startRound();
    }

    if (this.browser_active) {
      this.main.render();
    }
  }

  returnExtraCommitmentFields(game_obj) {
    return {
      button_player: game_obj?.state?.button_player || 0,
      small_blind: game_obj?.state?.small_blind || 0,
      big_blind: game_obj?.state?.big_blind || 0
    };
  }

  returnShortGameOptionsArray(options) {
    let sgoa = super.returnShortGameOptionsArray(options);
    let ngoa = {};
    let crypto = '';
    for (let i in sgoa) {
      try {
        if (sgoa[i] != '') {
          let okey = i;
          let oval = sgoa[i];

          let output_me = 1;
          if (okey == 'chip') {
            if (oval !== '0') {
              okey = 'small blind';
            } else {
              output_me = 0;
            }
          }
          if (okey == 'blind_mode') {
            if (oval == 'increase') {
              okey = 'mode';
              oval = 'tournament';
            } else {
              output_me = 0;
            }
          }
          if (okey == 'num_chips') {
            okey = 'chips';
          }

          if (okey == 'eliminated') {
            output_me = 0;
          }

          if (output_me == 1) {
            ngoa[okey] = oval;
          }
        }
      } catch (err) {
        console.error(err);
        console.log(i, sgoa[i]);
      }
    }

    return ngoa;
  }

  async render(app) {
    if (!this.browser_active) {
      return;
    }
    if (this.initialize_game_run) {
      return;
    }

    await this.injectGameHTML(this.main.html());

    this.menu.addMenuOption('game-game', 'Game');
    this.menu.addSubMenuOption('game-game', {
      text: 'How to Play',
      id: 'game-rules',
      class: 'game-rules',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.overlay.show(game_mod.returnGameRulesHTML());
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Stats',
      id: 'game-stats',
      class: 'game-stats',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.stats.toggle();
      }
    });
    this.menu.addSubMenuOption('game-game', {
      text: 'Log',
      id: 'game-log',
      class: 'game-log',
      callback: function (app, game_mod) {
        game_mod.menu.hideSubMenus();
        game_mod.log.toggleLog();
      }
    });

    this.theme = this.app.browser.isMobileBrowser() ? 'flat' : 'threed';

    await super.render(app);

    this.main.render();
    this.refreshPlayerboxes();
    this.menu.addChatMenu();
    this.menu.render();
    this.log.render();
    this.introduceLog();
    this.displayButton();
    this.insertCryptoLogo(this.game?.options?.crypto);

    if (document.querySelector('.game-scoreboard')) {
      document.querySelector('.game-scoreboard').style.display = 'none';
    }
  }

  async receiveStopGameTransaction(resigning_player, txmsg) {
    console.log('Poker: receiveStopGameTransaction', txmsg, resigning_player);

    if (this.publicKey === resigning_player) {
      super.receiveStopGameTransaction(resigning_player, txmsg);
      return;
    }

    let loser = -1;
    for (let i = 0; i < this.game.players.length; i++) {
      if (this.game.players[i] == resigning_player) {
        loser = i + 1;
        break;
      }
    }

    if (loser < 0) {
      console.log('Player is not in the game');
      return;
    }

    if (txmsg?.deck) {
      if (!this.game?.opponent_decks) {
        this.game.opponent_decks = {};
      }
      if (!this.game.opponent_decks[`${loser}`]) {
        this.game.opponent_decks[`${loser}`] = txmsg.deck;
      }
    }

    this.displayPlayerNotice(`<div class="plog-update">left the table</div>`, loser);
    this.playerbox.addClass('folded', loser);

    this.updateLog(this.game.state.player_names[loser - 1] + ' left the table');

    if (!this.game.state.passed[loser - 1]) {
      this.game.stats[resigning_player].folds++;
      this.game.state.passed[loser - 1] = 1;
      this.game.state.last_fold = loser;
    }

    await super.receiveStopGameTransaction(resigning_player, txmsg);

    if (this.game.target == loser) {
      this.game.state.plays_since_last_raise--;
      this.startQueue();
    }
  }

  endTurn(nextTarget = 0) {
    if (this.browser_active) {
      this.updateStatus('submitting move to peers...');
      this.controls.clear();
    }

    if (this.shot_clock) {
      clearTimeout(this.shot_clock);
      this.shot_clock = null;
    }

    this.game_help.hide();

    super.endTurn(nextTarget);
  }

  introduceLog() {
    if (this.log_intro_shown || !this.log) {
      return;
    }
    this.log_intro_shown = true;
    try {
      this.log.toggleLog();
      setTimeout(() => {
        let obj = document.querySelector('#log-wrapper');
        if (obj && obj.classList.contains('log-lock')) {
          this.log.toggleLog();
        }
      }, 2000);
    } catch (err) {}
  }

  updateStatus(str, force = 0) {
    if (this.browser_active && this.game.player) {
      let action = this.actionFromStatus(str);
      if (action) {
        this.playerbox.setAction(action, this.game.player);
      }
    }

    if (!force && str === this.game.status) {
      let el = document.getElementById('status');
      if (el && el.innerHTML === str) {
        return;
      }
    }

    this.game.status = str;
    if (!this.gameBrowserActive()) {
      return;
    }

    let el = document.getElementById('status');
    if (el) {
      el.innerHTML = str;
    }
  }

  updateControls() {}

  actionFromStatus(str) {
    let text = String(str || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text === 'you called') {
      let amt = this.game.state.required_pot - this.game.state.player_pot[this.game.player - 1];
      return `called ${this.formatWager(amt, false)}`;
    }
    if (text === 'you folded') {
      return 'folded';
    }
    if (text === 'you checked') {
      return 'checked';
    }
    if (text === 'all in!') {
      return 'all in';
    }
    if (text.indexOf('bets ') === 0 || text.indexOf('goes all in') === 0) {
      return text;
    }
    return '';
  }

  returnGameRulesHTML() {
    return GameRulesTemplate(this.app, this);
  }

  returnAdvancedOptions() {
    return GameOptionsTemplate(this.app, this);
  }

  attachAdvancedOptionsEventListeners() {
    let blindModeInput = document.getElementById('blind_mode');
    let numChips = document.getElementById('num_chips');
    let blindDisplay = document.getElementById('blind_explainer');
    let crypto = document.getElementById('crypto');
    let stakeValue = document.getElementById('stake');
    let chipInput = document.getElementById('chip_wrapper');

    const updateChips = function () {
      if (numChips && stakeValue && chipInput) {
        if (crypto.value == '') {
          chipInput.style.display = 'none';
          stake.value = '0';
        } else {
          let nChips = parseInt(numChips.value);
          let stakeAmt = parseFloat(stakeValue.value);
          let jsMath = stakeAmt / nChips;
          chipInput.style.display = 'block';
        }
      }
    };

    if (blindModeInput && blindDisplay) {
      blindModeInput.onchange = function () {
        if (blindModeInput.value == 'static') {
          blindDisplay.textContent =
            'Small blind is one chip, big blind is two chips throughout the game';
        } else {
          blindDisplay.textContent =
            'Small blind starts at one chip, and increments by 1 every 5 rounds';
        }
      };
    }

    if (crypto) {
      crypto.onchange = updateChips;
    }
    if (numChips) {
      numChips.onchange = updateChips;
    }
  }
}

Texas.importFunctions(PokerState, PokerStake, PokerQueue, PokerUI, PokerCards);

module.exports = Texas;
