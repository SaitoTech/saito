class PokerUI {
  returnPlayerRole(player) {
    if (this.game.state.winners.length > 0) {
      if (this.game.state.winners.includes(player)) {
        return 'Winner!';
      }
    }

    if (player == this.game.state.button_player && player == this.game.state.small_blind_player) {
      return 'dealer / small blind';
    }

    if (player == this.game.state.button_player) {
      return 'dealer';
    }
    if (player == this.game.state.small_blind_player) {
      return 'small blind';
    }
    if (player == this.game.state.big_blind_player) {
      return 'big blind';
    }

    return '';
  }

  displayPlayers(preserveLog = false) {
    if (!this.browser_active) {
      return;
    }

    if (this._action_street === undefined) {
      this._action_street = this.game.state.flipped;
    } else if (this._action_street !== this.game.state.flipped) {
      this._action_street = this.game.state.flipped;
      preserveLog = false;
    }

    for (let i = 1; i <= this.game.players.length; i++) {
      this.playerbox.setRole(this.returnPlayerRole(i), i);
      this.displayPlayerStack(i);

      if (!preserveLog) {
        this.playerbox.setAction('', i);
      }
    }
  }

  clearPlayers() {
    for (let i = 1; i <= this.game.players.length; i++) {
      this.playerbox.updateGraphics('', i);
    }
  }

  refreshPlayerboxes() {
    this.playerbox.removeBoxes();
    this.playerbox.render();
    this.displayPlayers(true);

    if (this.game.player == 0) {
      this.displayHand();
    }
  }

  displayButton() {
    for (let i = 1; i <= this.game.players.length; i++) {
      this.playerbox.setRole(this.returnPlayerRole(i), i);
    }
  }

  displayHand() {
    if (this.game.player == 0) {
      this.updateStatus(
        this.game.pending_join
          ? `Waiting to be dealt in -- you will join at the start of the next hand`
          : `you are observing the game`,
        -1
      );
      return;
    }

    if (this.game.state.passed[this.game.player - 1]) {
      this.cardfan.hide();
    } else {
      this.cardfan.render();
    }
  }

  showPlayerHand(player, card1, card2) {
    if (!this.gameBrowserActive()) {
      return;
    }

    let playercards = `<div class="other-player-hand hand">
                    <div class="card"><img src="${this.card_img_dir}/${this.game.deck[0].cards[card1].name}"></div>
                    <div class="card"><img src="${this.card_img_dir}/${this.game.deck[0].cards[card2].name}"></div>
                  </div>
                `;

    this.playerbox.updateGraphics(playercards, player);
  }

  //
  // Updates the status / text information body of player box.
  // With no player specified this is "my" box -- for a non-player viewer
  // (game.player == 0) that is the viewer box in seat 1.
  //
  displayPlayerNotice(msg, player = this.game.player) {
    let action = this.actionFromNotice(msg, player);
    if (action !== null) {
      this.playerbox.setAction(action, player);
    }

    if (player == this.game.player) {
      if (
        msg &&
        !String(msg).includes('plog-update') &&
        !String(msg).includes('in pot')
      ) {
        this.updateStatus(msg);
      }
    }

    console.log('displayPlayerNotice:', msg);
  }

  actionFromNotice(msg, player) {
    let text = String(msg || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) {
      return '';
    }

    if (text.includes('in pot')) {
      return 'thinking';
    }

    if (text === 'calls') {
      let amt = this.game.state.required_pot - this.game.state.player_pot[player - 1];
      return `called ${this.formatWager(amt, false)}`;
    }

    if (text === 'checks') {
      return 'checked';
    }

    if (text === 'folds') {
      return 'folded';
    }

    if (text === 'thinking') {
      return 'thinking';
    }

    if (text.indexOf('blind bets ') === 0) {
      return `bet ${text.slice('blind bets '.length)}`;
    }

    if (text.indexOf('bets ') === 0) {
      return text;
    }

    return text;
  }

  displayPlayerStack(player, amount = -1) {
    if (!this.browser_active) {
      return;
    }

    if (amount === -1) {
      amount = this.game.state.player_credit[player - 1];
    }

    let chips = amount === 1 ? 'CHIP' : 'CHIPS';
    let stack_html = `${amount} ${chips}`;

    if (typeof this.game.stake === 'string' && this.game.crypto !== 'CHIPS') {
      stack_html += ` (${this.convertChipsToCrypto(amount)} ${this.game.crypto})`;
    }

    this.playerbox.setChips(stack_html, player);
  }

  //
  // We will actually increment player stack / decrement the game pot in this function!!!
  //
  async animateWin(amount, winners) {
    this.animating = true;

    let step_speed = Math.min(200, 1000 / amount);

    while (amount >= Object.keys(winners).length && this.animating) {
      for (let j in winners) {
        j = parseInt(j);
        this.moveGameElement(
          this.createGameElement(`<div class="poker-chip"></div>`, '.pot'),
          `.game-playerbox-${j + 1}`,
          {
            callback: () => {
              this.pot.render(Math.max(0, --amount));
              this.displayPlayerStack(j + 1, ++winners[j]);
            },
            run_all_callbacks: true
          },
          (item) => {
            $(item).remove();
          }
        );
        await this.timeout(step_speed);
      }
    }

    if (amount > 0) {
      // ***TO DO: examine possibility of fractional chips
      // Randomly give the remaining chip to one player
    }
  }

  async animateBet(better, amount, restartQueue = false) {
    if (restartQueue) {
      this.halted = 1;
    }

    let initial_pot = this.pot.render();
    let initial_stack = this.game.state.player_credit[better - 1];

    let step_speed = Math.min(150, 550 / amount);

    let qs;

    for (let i = 1; i <= amount; i++) {
      this.moveGameElement(
        this.createGameElement(`<div class="poker-chip"></div>`, `.game-playerbox-${better}`),
        '.pot',
        {
          callback: () => {
            this.pot.render(++initial_pot);
            this.displayPlayerStack(better, --initial_stack);
            // player_pot is update outside the animation...
            /*qs = this.playerbox.replaceGraphics(
              `<div class="poker-player-stake"><span class="stake-in-chips">${this.game.state.player_pot[better - 1] + i}</span></div>`,
              '.poker-player-stake',
              better
            );*/
            this.pot.addPulse();
          },
          run_all_callbacks: true
        },
        (item) => {
          /*if (this.loadGamePreference('poker-hide-pot')) {
            setTimeout(() => {
              document.querySelector(qs).classList.add('invisible');
            }, 500);
          }*/

          if (!restartQueue) {
            $(item).remove();
          } else {
            $('.animated_elem').remove();
            this.restartQueue();
          }
        }
      );
      await this.timeout(step_speed);
    }
    await this.timeout(500);
  }

  /*
  This is the core Poker function
  */

  playerTurn() {
    if (this.browser_active == 0) {
      return;
    }
    if (this.game.player == 0) {
      salert('How on earth did we call player-zero turn??');
      return;
    }

    let poker_self = this;

    //
    // cancel raise kicks us back
    //
    if (!poker_self.moves.includes('resolve\tturn')) {
      poker_self.addMove('resolve\tturn');
    }

    let match_required =
      this.game.state.required_pot - this.game.state.player_pot[this.game.player - 1];

    if (match_required == 0 && this.game.state.all_in) {
      poker_self.addMove(`allin`);
      poker_self.endTurn();
      return;
    }

    if (match_required < 0) {
      console.warn('Hmmm, can bet negative chips');
      match_required = 0;
    }

    //These would be a strange edge case
    this.game.state.last_raise = Math.max(this.game.state.last_raise, this.game.state.big_blind);

    let can_call = this.game.state.player_credit[this.game.player - 1] >= match_required;
    let can_raise =
      !this.game.state.all_in &&
      this.game.state.player_credit[this.game.player - 1] > match_required;

    //cannot raise more than everyone can call.
    //
    // TODO - buy-ins will change this smallest stack calculation
    //
    let smallest_stack = this.game.chips * poker_self.game.players.length; //Start with total amount of money in the game
    let smallest_stack_player = 0;

    poker_self.game.state.player_credit.forEach((stack, index) => {
      if (poker_self.game.state.passed[index] == 0) {
        stack += this.game.state.player_pot[index];
        stack -= this.game.state.required_pot;
        if (stack < smallest_stack) {
          smallest_stack = stack;
          smallest_stack_player = index;
        }
      }
    });

    if (!can_call) {
      this.updateStatus('you can only fold...');
      this.addMove('fold\t' + poker_self.game.player);
      this.endTurn();
      return;
    }

    this.displayPlayerNotice(
      `${this.formatWager(this.game.state.player_pot[this.game.player - 1])} in pot`,
      this.game.player
    );

    this.controls.showPrimary({
      match_required,
      can_raise,
      max_raise: Math.min(
        this.game.state.player_credit[this.game.player - 1] - match_required,
        smallest_stack
      ),
      last_raise: this.game.state.last_raise
    });
  }
}

module.exports = PokerUI;
