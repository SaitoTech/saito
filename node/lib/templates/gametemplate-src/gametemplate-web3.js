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
      let html;
      if (results[0]?.svg) {
        html = `<div class="crypto_logo">${results[0].svg}</div>`;
      } else if (results[0]?.img) {
        html = `<div class="crypto_logo"><img src="${results[0].img}"></div>`;
      } else {
        return;
      }

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
   *
   * If we have established a game stake, this function will get called at the end of the game
   * Games like poker/blackjack that settle every round or have players join/leave at will, are
   * processed in table-gametemplate in an overrode function
   *
   * So given one or more winners, the remaining players send the bet amount to the winners
   *
   * In a 2 player game, the 1 loser pays the 1 winner.
   * If there is a tie, no money is sent
   * In a 3 player game, 1 winner collect 1 stake from each of the losers
   * In a 3 player game, if there is a 2 way tie, the 1 loser pays half the stake to each winner
   * etc.
   *
   */
  async settleGameStake(winners) {
    console.info('GT [settleGameStake] winners: ', winners);

    if (!this.game?.stake || !this.game?.crypto) {
      return;
    }

    if (this.game.crypto == 'CHIPS') {
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
        amount_to_send = amount_to_send / winners.length;
        if (!winners.includes(loser)) {
          for (let winner of winners) {
            await this.payWinner(loser, winner, amount_to_send);
          }
        }
      } else {
        if (loser !== winners) {
          await this.payWinner(loser, winners, amount_to_send);
        }
      }
    }
  }

  /**
   * This function is very similar to the QUEUE Commands
   * SEND & RECEIVE except without the game loop logic.
   *
   * If the player is the sender or receiver, they will launch the appropriate
   * UI to trigger a crypto transfer
   *
   */
  async payWinner(sender, receiver, amount) {
    let ts = new Date().getTime();

    // 0 stake condition
    if (!amount) {
      if (this.publicKey === sender) {
        siteMessage("You lost, but don't owe anything");
      } else if (this.publicKey === receiver) {
        siteMessage('You won, and get to keep your stake');
      }
      return;
    }

    this.rollDice();
    let unique_hash = this.app.crypto.hash(
      Buffer.from(sender + receiver + amount + this.game.dice + this.game.crypto, 'utf-8')
    );

    amount = this.app.crypto.convertFloatToSmartPrecision(parseFloat(amount));
    let ticker = this.game.crypto;

    //
    // if we are the sender, lets get sending and receiving addresses
    //

    let game_self = this;
    let sender_crypto_address = '';
    let receiver_crypto_address = '';
    for (let i = 0; i < this.game.players.length; i++) {
      let player = i + 1;
      let crypto = this.game.crypto;
      if (this.game.players[i] === sender) {
        sender_crypto_address = this.game.cryptos[player][crypto]['address'];
      }
      if (this.game.players[i] === receiver) {
        receiver_crypto_address = this.game.cryptos[player][crypto]['address'];
      }
    }

    if (this.publicKey === sender) {
      this.app.connection.emit('saito-crypto-send-render-request', {
        publicKey: receiver,
        address: receiver_crypto_address,
        amount,
        ticker,
        hash: unique_hash,
        // always confirm at end of game ???
        mycallback: async function () {
          await game_self.app.wallet.sendPayment(
            ticker,
            [sender_crypto_address],
            [receiver_crypto_address],
            [amount],
            unique_hash,
            function (robj) {
              console.debug('GT [payWinner] End game crypto transfer callback', robj);
              game_self.app.connection.emit('saito-crypto-send-confirm', robj, unique_hash);
            },
            receiver
          );
          return 0;
        }
      });
    } else if (this.publicKey === receiver) {
      await game_self.app.wallet.receivePayment(
        ticker,
        [sender_crypto_address],
        [receiver_crypto_address],
        [amount],
        unique_hash,
        function () {
          game_self.app.connection.emit('saito-crypto-receive-render-request', {
            publicKey: sender,
            address: sender_crypto_address,
            amount: amount,
            hash: unique_hash,
            ticker
          });
        },
        sender
      );
    }
  }

  addPaymentToQueue(sender, receiver, amount_to_send) {
    let ts = new Date().getTime();
    this.rollDice();
    let uh = this.app.crypto.hash(
      Buffer.from(sender + receiver + amount_to_send + this.game.dice + this.game.crypto, 'utf-8')
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
