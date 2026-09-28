/*********************************************************************************
 GAME UI

 Persistent game UI state owned by the engine:

 - log - an array of game updates
 - status - a single sentence describing state of processing

 HUD presentation is GameHUD2:
   this.hud.updateStatus(status)
   this.hud.updateMenu(options, callback)
   this.hud.updateCards(cards, callback)

**********************************************************************************/
let SaitoOverlay = require('./../../saito/ui/saito-overlay/saito-overlay');

class GameUI {
  updateLog(str, force = 0) {
    try {
      this.game.log.unshift(str);
      if (this.game.log.length > this.log_length) {
        this.game.log.splice(length);
      }
      if (this.gameBrowserActive() && this.log.rendered) {
        this.log.updateLog(str, force);
        //
        // adds mouseover to cards in log
        //
        if (this.useCardbox) {
          this.cardbox.attachCardEvents();
        }
      }
    } catch (err) {}
  }

  ///
  // These three functions are used by Blackjack and Imperium ...
  // but were delete in refactor / readded by WASM
  // TODO: fix this
  ///
  lockInterface() {
    this.lock_interface = 1;
    this.lock_interface_step = this.game.queue[this.game.queue.length - 1];
  }

  unlockInterface() {
    this.lock_interface = 0;
  }

  mayUnlockInterface() {
    if (this.lock_interface_step === this.game.queue[this.game.queue.length - 1]) {
      return 1;
    }
    return 0;
  }

  ///////////////////////////////////////////////////////////////////////////////////////
  ///////////// META USER INTERFACE /////////////////////////////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////

  setPlayReminder() {
    //We can assume anyone holding their phone is going to be paying attention!
    if (this.app.browser.isMobileBrowser(navigator.userAgent) || this.play_reminder) {
      return;
    }

    this.play_reminder = setTimeout(() => {
      let newOverlay = new SaitoOverlay(this.app, this, false, true, true);
      newOverlay.show(`<div class="message_box">the move is yours</div>`);
      window.removeEventListener('mousemove', clearTimer);
    }, 15000);

    const clearTimer = () => {
      clearTimeout(this.play_reminder);
      this.play_reminder = null;
    };

    window.addEventListener('mousemove', clearTimer, { once: true });
  }

  notifyMove() {
    if (!this.gameBrowserActive() || this.ignore_notifications) {
      return;
    }

    //Flash tab
    this.app.browser.createTabNotification('New Move', this.returnName());
    //Play a sound
    this.playChime();
  }

  playChime() {
    if (this.app.browser.active_tab || !this.game_move_notification) {
      return;
    }

    if (this.beeping) {
      return;
    }

    this.beeping = setTimeout(() => {
      this.beeping = null;
    }, 1000);

    try {
      this.game_move_notification.play();
    } catch (err) {
      console.error('ERROR: user not engaging with application', err);
    }
  }

  setShotClock(target = '', timer = 3000, pause_on_activity = true, callback = null) {
    this.clearShotClock();
    if (!target) {
      console.warn('GT [setShotClock] empty target!');
      return;
    }
    let elem = document.querySelector(target);
    if (elem) {
      this.app.browser.addElementToSelector(`<div class="animated-mask"></div>`, target);

      this.shot_clock = setTimeout(() => {
        this.clearShotClock();

        //
        // the UI may have been re-rendered (or repurposed entirely, e.g. by a
        // game-over) since the clock was armed -- only auto-click a control
        // that still matches the selector we were armed for
        //
        let clickable = elem.isConnected ? elem : document.querySelector(target);
        if (!clickable) {
          console.warn(
            `GT [setShotClock] not auto-clicking '${target}' -- control was replaced or removed`
          );
          return;
        }

        if (callback) {
          callback();
        }
        clickable.click();
      }, timer);

      $('.animated-mask').animate({ width: '0px' }, timer);

      if (pause_on_activity) {
        document.body.addEventListener(
          'click',
          () => {
            this.clearShotClock(false);
          },
          { once: true }
        );
      }
    } else {
      console.warn('GT [setShotClock] target not found!');
    }
  }

  clearShotClock(remove_mask = true) {
    if (this.shot_clock) {
      clearTimeout(this.shot_clock);
      this.shot_clock = null;
      $('.animated-mask').stop();
    }

    if (remove_mask) {
      $('.animated-mask').remove();
    } else {
      $('.animated-mask').addClass('flash3');
    }
  }

  promptMove(target = '', timer = 10000) {
    this.clearShotClock();
    if (!target) {
      console.warn('GT [promptMove] empty target!');
      return;
    }
    let elem = document.querySelector(target);
    if (elem) {
      this.app.browser.addElementToSelector(`<div class="animated-mask flash2"></div>`, target);

      this.shot_clock = setTimeout(() => {
        if (timer > 1000) {
          timer -= 1000;
        }
        this.promptMove(target, timer);
      }, timer);
    }
  }

  //////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////   END GAME USER INTERFACE   ////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////////////////////
  gameOverUserInterface() {
    let winner = this.game.winner;
    let reason = this.game.reason;

    //Stop players from clicking more
    this.removeEvents();

    // Game is over, we don't care if people navigate away
    this.app.browser.unlockNavigation();

    /////////////////////////////////////////////////////
    // Update the Game UI to reflect the end of the game
    /////////////////////////////////////////////////////
    let readable = '';
    //Check if multiple winners, or none
    if (winner.includes(this.publicKey)) {
      readable = 'You win';
    } else {
      if (Array.isArray(winner)) {
        for (let w of winner) {
          readable += this.app.keychain.returnUsername(w) + ', ';
        }
        readable = readable.substring(0, readable.length - 2) + ' win';
        if (winner.length == 1) {
          readable += 's';
        }
      } else {
        readable = this.app.keychain.returnUsername(winner) + ' wins';
      }
    }

    //Include reason if given
    if (reason != '') {
      readable += ' by ' + reason;
    } else {
      readable += '!';
    }

    //Just state reason if no winners
    if (winner.length == 0 || reason == 'cancellation') {
      readable = reason;
    }

    readable = 'Game Over: ' + readable;

    try {
      this.hud.hideBackButton();

      this.updateLog(readable);

      this.updateStatusForGameOver(readable, reason !== 'cancellation' && !this.opengame);
    } catch (err) {
      console.error('GT [gameoverUserInterface] Error: ', err);
    }
  }

  updateStatusForGameOver(status, allowRematch) {
    let target = this.app.options.homeModule || 'Arcade';
    allowRematch = allowRematch && this.game.player !== 0 && this.game.players.length == 2;

    this.hud.hideBackButton();

    this.game.status = status;
    this.hud.updateStatus(status);
    this.hud.updateCards([]);

    let menu = [{ id: 'confirmit', label: `Return to ${target}` }];
    if (allowRematch) {
      menu.push({ id: 'rematch', label: 'Rematch' });
    }

    this.hud.updateMenu(menu, (id) => {
      if (id === 'rematch') {
        this.initialize_game_run = 0;
        this.app.connection.emit('arcade-issue-challenge', {
          game: this.name,
          players: this.game.players,
          options: this.game.options
        });
        return;
      }
      if (id === 'confirmit') {
        this.exitGame();
      }
    });

    ////////////////////////////////////////
    // Attach Listeners for rematch actions
    ////////////////////////////////////////
    this.app.connection.on('arcade-challenge-issued', (tx) => {
      let btn = document.getElementById('rematch');
      if (btn) {
        if (tx.isFrom(this.publicKey)) {
          btn.innerHTML = 'Rematch requested';
        } else {
          btn.innerHTML = 'Accept Rematch';
          // We could change the functionality here... but... should work
        }
      }
    });

    this.app.connection.on('arcade-game-initialize-render-request', (game_id) => {
      this.game.status = 'Preparing rematch...';
      this.hud.updateStatus('Preparing rematch...');
      this.hud.updateMenu([]);
      this.browser_active = 0; //Hack to simulate not being in the game mod
    });

    this.app.connection.on('arcade-game-ready-render-request', (game_details) => {
      let status = document.getElementById('status') || document.querySelector('.status');
      let controls = document.getElementById('controls') || document.querySelector('.controls');

      if (controls) {
        controls.innerHTML = `<ul><li class="textchoice" id="go">start game</li></ul>`;
        status.innerHTML = 'game ready';
      } else {
        status.innerHTML = `game ready<ul><li class="textchoice" id="go">start game</li></ul>`;
      }

      if (document.getElementById('go')) {
        document.getElementById('go').onclick = (e) => {
          this.app.browser.unlockNavigation();
          e.currentTarget.onclick = null;
          navigateWindow(`/${game_details.slug}`, 100);
        };
      }
    });
  }

  updateStatusForPlayerOut(status, allowObserver = false) {
    let target = this.app.options.homeModule || 'Arcade';

    this.hud.hideBackButton();

    this.halted = 1;

    this.game.status = status;
    this.hud.updateStatus(status);
    this.hud.updateCards([]);
    this.hud.updateMenu([{ id: 'confirmit', label: `Return to ${target}` }], (id) => {
      if (id === 'confirmit') {
        this.exitGame();
      }
    });

    this.lockInterface();
  }
}

module.exports = GameUI;
