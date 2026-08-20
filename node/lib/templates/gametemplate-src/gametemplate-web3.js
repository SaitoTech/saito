/*********************************************************************************
 GAME WEB3


**********************************************************************************/
class GameWeb3 {
  //
  // games can override this function if they want to support crypto integration and
  // have any module-specific initialization work to do. it is a good idea to restart
  // the game for instance...
  //
  async initializeGameStake(ticker, stake) {
    this.game.options.crypto = ticker;
    this.game.options.stake = stake;
    this.game.crypto = ticker;
    this.game.stake = stake;

    // Need to parse if asymmetrical
    if (typeof stake === 'object') {
      let obj = Object.assign({}, stake);
      delete obj.min;
      stake = Object.values(obj).join(' / ');
    }

    this.updateLog(`Crypto Activated: ${stake} ${ticker}`);
    siteMessage(`Crypto Activated: ${stake} ${ticker}`, 2000);

    this.saveGame(this.game.id);

    if (this.gameBrowserActive()) {
      this.insertCryptoLogo(ticker);

      // Updates playerboxes (if used)
      this.insertLeagueRankings();

      // Re-render game-menu
      let cm = this.app.modules.returnModule('Crypto');
      if (cm) {
        let cmenu = cm.respondTo('game-menu', this);
        this.menu.replaceMenuByID(cmenu);
      }
    }
  }

  insertCryptoLogo(ticker) {
    let results = this.app.modules.getRespondTos('crypto-logo', { ticker });

    if (results.length > 0) {
      let html = `<div class="game-crypto-logo-container">`;
      if (results[0]?.svg) {
        html += results[0].svg;
      } else if (results[0]?.alt_img) {
        html += `<img class="crypto-logo" src="${results[0].alt_img}">`;
      } else if (results[0]?.img) {
        html += `<img class="crypto-logo" src="${results[0].img}">`;
      } else {
        return;
      }
      html += '</div>';

      let target = 'body';
      if (document.querySelector('.main')) {
        target = '.main';
      } else if (document.querySelector('.gameboard')) {
        target = '.gameboard';
      }

      if (!document.querySelector('.crypto_logo')) {
        this.app.browser.prependElementToSelector(html, target);
      }
    }
  }

  //
  // this allows players to propose a crypto/web3 stake for the game. it will trigger
  // the STAKE command among players who have not INIT'd or APPROVED the shift allowing
  // them to accept / reject the idea.
  //
  async proposeGameStake(ticker = '', stake = '', sigs = [], ts = new Date().getTime()) {
    //
    // use sigs to track the confirmations
    //

    while (sigs.length < this.game.players.length) {
      sigs.push('');
    }

    let privateKey = await this.app.wallet.getPrivateKey();

    let stake_val = typeof stake === 'object' ? stake?.min : stake;

    sigs[this.game.player - 1] = this.app.crypto.signMessage(
      `${ts} ${ticker} ${stake_val} ${this.game.id}`,
      privateKey
    );

    this.sendMetaMessage('STAKE', { ticker, stake, sigs, ts });
  }

  async refuseGameStake(ticker = '', stake = '') {}

  /**
   * Called by the SETTLE queue command when the game has ended.
   * Adds standard SEND/RECEIVE payment commands to the queue for each
   * loser's obligation to the winner(s).
   *
   * Table games override this to settle accumulated per-hand debt instead.
   */
  queueGameStakeSettlement() {
    let winners = this.game.winner;
    console.info('GT [queueGameStakeSettlement] winners: ', winners);

    if (!this.game?.stake || !this.game?.crypto) {
      console.debug(
        'GT [queueGameStakeSettlement] No stake: ',
        this.game.stake,
        this.game.crypto
      );
      return;
    }

    if (this.game.crypto == 'CHIPS') {
      console.debug(
        'GT [queueGameStakeSettlement] Playing with chips: ',
        this.game.stake,
        this.game.crypto
      );
      return;
    }

    let amount_to_send;

    for (let i = 0; i < this.game.players.length; i++) {
      if (typeof this.game.stake == 'object') {
        amount_to_send = this.game.stake[this.game.players[i]];
      } else {
        amount_to_send = parseFloat(this.game.stake);
      }

      let loser = this.game.players[i];

      if (Array.isArray(winners)) {
        if (winners.length === 0) {
          continue;
        }
        amount_to_send = amount_to_send / winners.length;
        if (!winners.includes(loser)) {
          for (let winner of winners) {
            this.addPaymentToQueue(loser, winner, amount_to_send);
          }
        }
      } else {
        if (winners && loser !== winners) {
          this.addPaymentToQueue(loser, winners, amount_to_send);
        }
      }
    }
  }

  addPaymentToQueue(sender, receiver, amount_to_send) {
    let ts = new Date().getTime();
    this.rollDice();
    amount_to_send = this.app.crypto.convertFloatToSmartPrecision(parseFloat(amount_to_send));
    let amount_for_unique_hash = amount_to_send;
    if (this.game.crypto == 'SAITO') {
      amount_for_unique_hash = this.app.wallet
        .convertSaitoToNolan(amount_for_unique_hash)
        .toString();
    }
    let uh = this.app.crypto.hash(
      Buffer.from(
        sender + receiver + amount_for_unique_hash + this.game.dice + this.game.crypto,
        'utf-8'
      )
    );

    console.debug(
      `GT [addPaymentToQueue]: ${sender}\t${receiver}\t${amount_to_send}\t${this.game.crypto}`
    );

    this.game.queue.push(
      `RECEIVE\t${sender}\t${receiver}\t${amount_to_send}\t${ts}\t${uh}\t${this.game.crypto}`
    );
    this.game.queue.push(
      `SEND\t${sender}\t${receiver}\t${amount_to_send}\t${ts}\t${uh}\t${this.game.crypto}`
    );
  }

  //
  // float to string
  //
  fts(val) {
    try {
      if (val.toFixed(8)) {
        val = val.toFixed(8);
      }
    } catch (err) {}
    return this.app.crypto.convertStringToDecimalPrecision(val);
  }

  //
  // string to float
  //
  stf(val) {
    if (!isNaN(val) && val.toString().indexOf('.') != -1) {
      return parseFloat(parseFloat(val).toFixed(8));
    }
    val = parseFloat(val);
    val = parseFloat(val.toFixed(8));
    return val;
  }

  //
  // add to string
  //
  addToString(x, add_me) {
    let y = this.stf(x) + this.stf(add_me);
    y = this.fts(y);
    return this.app.crypto.convertStringToDecimalPrecision(y, 8);
  }

  //
  // subtract from string
  //
  subtractFromString(x, subtract_me) {
    let y = this.stf(x) - this.stf(subtract_me);
    if (y < 0) {
      y = 0;
    }
    return this.app.crypto.convertStringToDecimalPrecision(y, 8);
  }

  showStakeOverlay() {
    let html = `<div class="stake-info-overlay"><div class="h3">Game Stake</div>`;
    if (typeof this.game.stake === 'object') {
      html += `<div class="player-table">`;
      for (let i in this.game.stake) {
        if (i !== 'min') {
          html += `<div>${this.app.keychain.returnUsername(i)}</div> <div>stakes</div> <div>${
            this.game.stake[i]
          } ${this.game.crypto}</div>`;
        }
      }
      html += '</div>';
    } else {
      html += `<div class="player-bet-info">${this.game.stake} ${this.game.crypto} staked on this game!</div>`;
    }

    html += '</div>';
    this.overlay.show(html);
  }
}

module.exports = GameWeb3;
