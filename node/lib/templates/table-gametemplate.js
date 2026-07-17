/****************************************************************
 *
 * An extension of the Game Engine for special games like
 * Poker or Blackjack where you want to start a game with
 * 2 players, but have open slots on the table that other
 * players can join at a later time. Meanwhile, players can
 * stop playing without ending the game
 *
 *
 ***************************************************************/

const Transaction = require('../../lib/saito/transaction').default;
const GameTemplate = require('./gametemplate');
const SaitoOverlay = require('./../saito/ui/saito-overlay/saito-overlay');

class GameTableTemplate extends GameTemplate {
  constructor(app) {
    super(app);

    this.can_bet = 1;
    this.crypto_msg = 'settles round-by-round';

    this.opengame = true;
    //
    // We will use this as a flag for Arcade to distinguish between parent and child class
    // players still need to select 'open-game' through the Arcade game wizard to fully realize
    // differential behavior
    //

    this.toJoin = [];
    this.toLeave = [];
    this.joining = {};
    this.leaving = {};
    this.statistical_unit = 'hand';
    this.resetCommand = 'newround';
    this.exitOverlay = new SaitoOverlay(app, this, false);
  }

  initializeGame() {
    super.initializeGame();
  }

  //
  // Canonical hash of the consensus-critical game state at a hand boundary.
  // Used by the mid-game JOIN protocol: every player signs the commitment of
  // their own newround snapshot so a joiner can verify that the state they
  // received is the state everyone agreed on. Consensus fields only -- never
  // include per-client data (player, keys, step.players, player_names, queues).
  //
  returnStateCommitment(game_obj) {
    let fields = {
      id: game_obj.id,
      players: game_obj.players,
      round: game_obj?.state?.round || 0,
      player_credit: game_obj?.state?.player_credit || [],
      debt: game_obj?.state?.debt || []
    };
    Object.assign(fields, this.returnExtraCommitmentFields(game_obj));
    return this.app.crypto.hash(JSON.stringify(fields));
  }

  //
  // modules may override to commit additional consensus fields
  //
  returnExtraCommitmentFields(game_obj) {
    return {};
  }

  pruneStateCommitments(keep = 5) {
    if (!this.game.state_commitments) {
      return;
    }
    let rounds = Object.keys(this.game.state_commitments)
      .map(Number)
      .sort((a, b) => a - b);
    while (rounds.length > keep) {
      delete this.game.state_commitments[rounds.shift()];
    }
  }

  //
  // Build the hand-boundary snapshot used to answer join requests: the game
  // state stripped of secret card data and per-client bookkeeping. Sets
  // this.cacheGame (in memory only -- a reload without a snapshot simply
  // defers signing to the next newround) and returns the serialized string so
  // callers can reuse it for a SHARE without re-serializing.
  //
  buildBoundarySnapshot() {
    let deck = this.game.deck;
    let pool = this.game.pool;
    let commitments = this.game.state_commitments;

    this.game.deck = [];
    this.game.pool = [];
    delete this.game.state_commitments;

    let snapshot = JSON.stringify(this.game);

    this.game.deck = deck;
    this.game.pool = pool;
    if (commitments !== undefined) {
      this.game.state_commitments = commitments;
    }

    this.cacheGame = JSON.parse(snapshot);
    return snapshot;
  }

  // the message every player signs to authorize a join
  returnJoinSigMessage(pkey, round, commitment) {
    return `ADDPLAYER ${pkey} ${round} ${commitment}`;
  }

  // has every current player signed off on this join?
  hasAllPlayerSigs(pkey) {
    let rec = this.joining[pkey];
    if (!rec) {
      return false;
    }
    for (let player of this.game.players) {
      if (!rec.sigs?.[player]) {
        return false;
      }
    }
    return true;
  }

  // clear the pending-join state once we have taken (or are taking) our seat
  finalizePendingJoin() {
    delete this.game.pending_join;
    if (this.pending_join_timeout) {
      clearTimeout(this.pending_join_timeout);
      this.pending_join_timeout = null;
    }
    if (this.browser_active) {
      this.syncBodyGameClasses();
    }
    this.app.connection.emit('arcade-gametable-addplayer', this.game.id);
  }

  // re-run game initialization in place (shared by the seat handoff and the
  // fewer-players reset)
  reinitializeGameRun(delay = 0) {
    const go = () => {
      this.initialize_game_run = 0;
      this.halted = 0;
      this.refreshPlayerboxes();
      this.initializeGameQueue(this.game.id);
    };
    if (delay) {
      setTimeout(go, delay);
    } else {
      go();
    }
  }

  async render(app) {
    if (!this.game.options['open-table']) {
      console.info('GTT: Treat table game as standard (closed) game');
      this.opengame = false;
    }

    await super.render(app);

    //
    // the first newround usually executes while players are still in the
    // arcade lounge, and navigating into the game room wipes the in-memory
    // snapshot -- rebuild it here so join requests can be serviced. at initial
    // render the game is parked at its boundary, so the current state IS the
    // snapshot.
    //
    if (this.game?.player && !this.cacheGame) {
      this.buildBoundarySnapshot();
    }
  }

  // Extension for table games
  async receiveMetaMessage(tx) {
    if (!tx.isTo(this.publicKey)) {
      console.warn("GTT: processing a tx that isn't addressed to us...");
    }

    let txmsg = tx.returnMessage();

    if (txmsg.request == 'JOIN') {
      let data = txmsg.data;
      let pkey = data.pkey;

      //
      // make sure the joiner receives our sig rebroadcasts and the eventual
      // boundary SHARE, regardless of FOLLOW/JOIN arrival order
      //
      this.addFollower(pkey);

      // Temporary storage here
      if (!this.joining[pkey]) {
        this.joining[pkey] = { pkey, sigs: {}, round: data.round || 0 };

        //
        // let seated players know right away
        //
        if (this.game.player && pkey !== this.publicKey) {
          siteMessage(
            `${this.app.keychain.returnUsername(pkey)} will join at the next round`,
            3000
          );
        }
      }

      //
      // merge incoming signatures -- keyed by signer pubkey, and only those
      // that cryptographically verify against the signer's key
      //
      for (let signer in data.sigs || {}) {
        let o = data.sigs[signer];
        if (o?.sig && !this.joining[pkey].sigs[signer]) {
          let msg = this.returnJoinSigMessage(pkey, o.round, o.commitment);
          if (this.app.crypto.verifyMessage(msg, o.sig, signer)) {
            this.joining[pkey].sigs[signer] = o;
            this.joining[pkey].round = Math.max(this.joining[pkey].round, o.round);
          } else {
            console.warn(`GTT: invalid JOIN sig from ${signer} -- discarding`);
          }
        }
      }

      //
      // I am a player: add my signature, anchored to my newround snapshot.
      // If I have no snapshot yet (e.g. reloaded mid-hand), the resetCommand
      // hook signs at the next newround instead.
      //
      if (this.game.player && !this.joining[pkey].sigs[this.publicKey]) {
        if (this.cacheGame) {
          await this.signJoinRequest(pkey);
          return;
        }
        console.warn('GTT: no snapshot yet -- will sign join request at next newround');
      }

      //
      // I am the joiner: verify + (if everyone has signed) enter the room.
      // checkPendingJoinReady runs verifyPendingJoin itself, which may abort.
      //
      if (this.game.pending_join && pkey === this.publicKey) {
        this.checkPendingJoinReady();
        if (this.game.over) {
          return; // aborted
        }
      }

      this.countJoinAuths(pkey);
      return;
    }

    if (txmsg.request == 'LEAVE') {
      console.info('GTT: Leave request:' + txmsg.my_key);
      if (!this.toLeave.includes(txmsg.my_key)) {
        this.toLeave.push(txmsg.my_key);
        siteMessage(
          `${
            this.publicKey == txmsg.my_key ? 'You' : this.app.keychain.returnUsername(txmsg.my_key)
          } will leave the table after this hand`,
          2500
        );
      }
      return;
    }

    if (txmsg.request == 'CANCEL') {
      this.toJoin = this.toJoin.filter((key) => key !== txmsg.my_key);
      this.toLeave = this.toLeave.filter((key) => key !== txmsg.my_key);
      delete this.joining[txmsg.my_key];
      siteMessage(`${this.app.keychain.returnUsername(txmsg.my_key)} changed their mind`, 2500);
      return;
    }

    if (txmsg.request == 'SETTLEMENT') {
      console.info(`GTT: ${tx.from[0].publicKey} requested we settle at the end of the round`);
      this.settleNow = true;
      siteMessage('Will settle at the end of the round', 1500);
      return;
    }

    //
    // a joiner FOLLOWs us to get onto our accepted[] list and prompt a share
    // of our latest hand-boundary state
    //
    if (txmsg.request == 'FOLLOW') {
      this.addFollower(txmsg.my_key);
      if (!tx.isFrom(this.publicKey)) {
        if (this.cacheGame) {
          this.sendMetaMessage('SHARE', JSON.stringify(this.cacheGame));
        } else {
          // no boundary snapshot yet -- ack now, share at the next newround
          this.share_state_on_snapshot = true;
          this.sendMetaMessage('SHARE', '');
        }
      }
      return;
    }

    //
    // only a pending joiner adopts shared state; seated players just keep
    // their accepted[] list in sync
    //
    if (txmsg.request == 'SHARE') {
      for (let i = 0; i < tx.to.length; i++) {
        this.addFollower(tx.to[i].publicKey);
      }
      if (this.game?.pending_join && txmsg.game_id == this.game.id) {
        this.adoptSharedTableState(tx);
      }
      return;
    }

    super.receiveMetaMessage(tx);
  }

  //
  // Adopt a hand-boundary snapshot received while waiting for a seat. If the
  // snapshot already lists us as a player, the table seated us at the last
  // boundary and we take our seat directly; otherwise we hold the pre-seat
  // state (following as player 0) and record a commitment baseline so
  // incoming signatures can be verified against exactly what we hold.
  //
  adoptSharedTableState(tx) {
    let txmsg = tx.returnMessage();

    // any response proves the table is live -- stop the no-response timer
    if (this.pending_join_timeout && !this.join_ready_emitted) {
      clearTimeout(this.pending_join_timeout);
      this.pending_join_timeout = null;
    }

    if (!txmsg.data) {
      console.info('GTT [SHARE] responder has no snapshot yet -- awaiting deferred share');
      return;
    }

    console.info('GTT [SHARE] adopting shared table state', tx.from[0].publicKey);

    let buffered_future = this.game?.future || [];
    this.game = JSON.parse(txmsg.data);
    this.game.live = true;

    let my_seat = this.game.players.indexOf(this.publicKey);
    if (my_seat >= 0) {
      this.game.player = my_seat + 1;
      delete this.game.pending_join;
    } else {
      this.game.player = 0;
      this.game.pending_join = true;
      if (!this.game.state_commitments) {
        this.game.state_commitments = {};
      }
      this.game.state_commitments[this.game.state?.round || 0] = this.returnStateCommitment(
        this.game
      );
    }

    //
    // moves that raced ahead of this SHARE were buffered on the stub -- carry
    // them over so we don't lose the first moves of the new hand (stale ones
    // are discarded by processFutureMoves)
    //
    if (!Array.isArray(this.game.future)) {
      this.game.future = [];
    }
    for (let ftx of buffered_future) {
      if (!this.game.future.includes(ftx)) {
        this.game.future.push(ftx);
      }
    }

    this.saveGame(this.game.id);

    if (my_seat >= 0) {
      // seated via the boundary handoff
      this.finalizePendingJoin();
      if (this.gameBrowserActive()) {
        this.reinitializeGameRun();
      } else {
        this.emitGameReadyRender();
      }
    } else {
      // signatures may already be complete -- can we enter the room yet?
      this.checkPendingJoinReady();
    }
  }

  syncPlayerJoins() {
    for (let pkey in this.joining) {
      this.countJoinAuths(pkey);
    }
  }

  //
  // sign a pending join request against our own newround snapshot and
  // rebroadcast the updated request so other players / the joiner can merge
  //
  async signJoinRequest(pkey) {
    if (!this.cacheGame || !this.joining[pkey]) {
      return;
    }

    const round = this.cacheGame.state?.round || 0;
    const commitment = this.returnStateCommitment(this.cacheGame);

    this.joining[pkey].sigs[this.publicKey] = {
      sig: this.app.crypto.signMessage(
        this.returnJoinSigMessage(pkey, round, commitment),
        await this.app.wallet.getPrivateKey()
      ),
      round,
      commitment
    };
    this.joining[pkey].round = Math.max(this.joining[pkey].round, round);

    this.sendMetaMessage('JOIN', this.joining[pkey]);
  }

  //
  // a join is authorized once every CURRENT player has a verified signature
  // on it (sigs from departed players are simply ignored)
  //
  countJoinAuths(pkey) {
    if (!this.joining[pkey] || this.toJoin.includes(pkey)) {
      return;
    }

    //
    // the joiner does not self-authorize -- their seat arrives via the
    // boundary state handoff, not via their own toJoin list
    //
    if (!this.game.player && pkey === this.publicKey) {
      return;
    }

    if (!this.hasAllPlayerSigs(pkey)) {
      return;
    }

    if (this.currentRound() >= this.joining[pkey].round) {
      this.toJoin.push(pkey);
      siteMessage(
        `${
          this.publicKey == pkey ? 'You' : this.app.keychain.returnUsername(pkey)
        } will be dealt in next hand`,
        2500
      );
      console.debug('GTT: JOIN SUCCESS:', JSON.parse(JSON.stringify(this.toJoin)));
    } else {
      console.warn("GTT: Don't add player because other players have already started next round!");
    }
  }

  //
  // joiner-side check: mutual consistency. we are not following the game, so
  // we cannot compare sigs against our own experience of the state -- but
  // every player who signs for the same round must commit to an IDENTICAL
  // state, and no single player can forge the others' signatures. if we do
  // hold a local baseline for a round (recorded while live-following), it
  // must match as well.
  //
  verifyPendingJoin() {
    let mine = this.joining[this.publicKey];
    if (!mine) {
      return true;
    }

    let commitments = {}; // round -> commitment
    for (let signer in mine.sigs) {
      let o = mine.sigs[signer];
      if (o?.sig) {
        if (commitments[o.round] && commitments[o.round] !== o.commitment) {
          this.abortPendingJoin('players disagree about the table state');
          return false;
        }
        commitments[o.round] = o.commitment;

        let local = this.game.state_commitments?.[o.round];
        if (local && local !== o.commitment) {
          this.abortPendingJoin('table state does not match the state you were given');
          return false;
        }
      }
    }
    return true;
  }

  abortPendingJoin(reason) {
    console.error('GTT: aborting join -- ' + reason);
    this.sendMetaMessage('CANCEL');
    delete this.joining[this.publicKey];
    delete this.game.pending_join;
    this.game.over = 2;
    this.saveGame(this.game.id);
    if (this.browser_active) {
      this.syncBodyGameClasses();
    }
    salert(`Unable to join this table: ${reason}. Returning to Arcade.`);
    this.exitGame();
  }

  //
  // Request a seat at an in-progress open table (called from the arcade).
  // Reuses the observer stub bootstrap (player = 0, accepted = invite
  // players), FOLLOWs for the current state, and broadcasts a JOIN request
  // for the seated players to sign. Signatures collect during the current
  // hand; the seat is assigned (and the state handed off) when it ends.
  //
  async requestSeatAtTable(game_tx) {
    let game_id = game_tx.signature;

    if (this.doesGameExistLocally(game_id)) {
      this.loadGame(game_id);
      if (this.game?.players?.includes(this.publicKey)) {
        return 'already-playing';
      }
    }

    if (this.game?.id !== game_id) {
      await this.initializeObserverMode(game_tx, true);
    }

    this.game.pending_join = true; // persisted -- survives navigation and reloads
    this.game.initializing = 1; // arcade lounge shows the initializing spinner
    this.join_ready_emitted = false;
    this.saveGame(this.game.id);

    //
    // FOLLOW gets us onto every player's accepted[] list and prompts a SHARE
    // of their latest hand-boundary snapshot
    //
    await this.sendMetaMessage('FOLLOW');

    //
    // broadcast the join request -- players sign against their own snapshots
    //
    this.joining[this.publicKey] = { pkey: this.publicKey, sigs: {}, round: 0 };
    await this.sendMetaMessage('JOIN', this.joining[this.publicKey]);

    //
    // nobody home? don't leave the joiner staring at a spinner forever
    //
    this.pending_join_timeout = setTimeout(() => {
      if (this.game?.pending_join && !this.join_ready_emitted) {
        delete this.game.pending_join;
        this.saveGame(this.game.id);
        salert('Unable to join: the players did not respond. Try again later.');
      }
    }, 20000);

    return 'requested';
  }

  //
  // the joiner is cleared to enter the game room once (a) the shared state
  // has been adopted and (b) every player has a verified signature over it.
  // called from the JOIN merge path and from SHARE adoption, whichever
  // completes last.
  //
  checkPendingJoinReady() {
    if (!this.game?.pending_join || this.join_ready_emitted) {
      return;
    }

    // verify first -- this can abort the join on a bad/conflicting commitment,
    // and is worth doing even before we have adopted the state
    if (!this.verifyPendingJoin()) {
      return;
    }

    // state adopted (the stub has no state object) and everyone has signed?
    if (!this.game?.state || !this.hasAllPlayerSigs(this.publicKey)) {
      return;
    }

    this.join_ready_emitted = true;
    if (this.pending_join_timeout) {
      clearTimeout(this.pending_join_timeout);
      this.pending_join_timeout = null;
    }

    siteMessage('Seat confirmed -- you will be dealt in at the next round', 3000);
    this.emitGameReadyRender();
  }

  addPlayerLate(address) {
    if (!this.addPlayer(address)) {
      return;
    }
    //To add a player after the game started,
    // need to assign this.game.player
    // add key
    if (this.publicKey === address) {
      this.game.player = this.game.players.length;
    }
    this.game.keys.push(address);
  }

  addPlayerToState(address) {
    console.error('GTT: Did you define addPlayerToState in your game module?');
  }

  refreshPlayerboxes() {
    console.error('GTT: Did you define refreshPlayerboxes in your game module?');
  }

  async receiveStopGameTransaction(resigning_player, txmsg) {
    //End game if only two players
    if (this.game.players.length == 2) {
      await super.receiveStopGameTransaction(resigning_player, txmsg);
      return;
    }

    if (this.publicKey === resigning_player) {
      this.game.over = 2;
      this.saveGame(this.game.id);
    }

    //Stop receiving game txs
    if (!this.game.players.includes(resigning_player)) {
      //Player already not an active player, make sure they are also removed from accepted to stop receiving messages
      for (let i = this.game.accepted.length; i >= 0; i--) {
        if (this.game.accepted[i] == resigning_player) {
          this.game.accepted.splice(i, 1);
        }
      }
      console.warn(`GTT: ${resigning_player} not in ${JSON.stringify(this.game.players)}`);
      this.saveGame(this.game.id);

      return;
    }

    //Schedule to leave at end of round
    if (!this.toLeave.includes(resigning_player)) {
      this.toLeave.push(resigning_player);
    }
  }

  //
  // Overwrite gametemplate-web3 function because these games are more complicated
  // Todo: check that there is no remaining debt
  //
  settleGameStake(winners) {
    if (typeof this.game.stake == 'object') {
      console.debug(
        'GTT [settleGameStake]: use standard end game log for asymmetrical winner-take-all'
      );
      super.settleGameStake(winners);
    } else {
      this.settleDebt();
    }
    return;
  }

  //
  // Execute any settlement we still owe before withdrawing from the table, so
  // that "leave now" cannot be used to walk out on debts from a finished hand.
  //
  // Two sources:
  //  (1) SEND instructions already on the queue where we are the sender --
  //      replayed with their original unique_hash, so the opponent's pending
  //      RECEIVE can resolve and the wallet can dedupe if the queued send
  //      already fired
  //  (2) debt accrued in game.state.debt that has not been converted into
  //      queued payments yet (player exits before the settle instruction runs)
  //
  // Resolves once the wallet has processed the payments, so the caller can
  // safely navigate away afterwards.
  //
  async settleDebtsOnExit() {
    if (!this.game?.crypto || this.game.crypto === 'CHIPS') {
      return;
    }

    let payments = [];

    //
    // (1) queued SENDs where we are the sender
    //
    for (let i = this.game.queue.length - 1; i >= 0; i--) {
      let mv = this.game.queue[i].split('\t');
      if (mv[0] === 'SEND' && mv[1] === this.publicKey) {
        payments.push({
          receiver: mv[2],
          amount: mv[3],
          unique_hash: mv[5],
          ticker: mv[6] || this.game.crypto
        });
        this.game.queue.splice(i, 1);
      }
    }

    //
    // (2) accrued debt not yet queued -- same pairing logic as settleDebt()
    //
    if (this.game.state?.debt && typeof this.game.stake != 'object') {
      let me = this.game.players.indexOf(this.publicKey);
      if (me >= 0 && this.game.state.debt[me] > 0) {
        for (let j = 0; j < this.game.state.debt.length && this.game.state.debt[me] > 0; j++) {
          if (this.game.state.debt[j] < 0) {
            let amount_owed = Math.min(Math.abs(this.game.state.debt[j]), this.game.state.debt[me]);
            if (amount_owed > 0) {
              this.game.state.debt[me] -= amount_owed;
              this.game.state.debt[j] += amount_owed;

              payments.push({
                receiver: this.game.players[j],
                amount:
                  typeof this.convertChipsToCrypto === 'function'
                    ? this.convertChipsToCrypto(amount_owed)
                    : String(amount_owed),
                unique_hash: null,
                ticker: this.game.crypto
              });
            }
          }
        }
      }
    }

    if (payments.length == 0) {
      return;
    }

    this.saveGame(this.game.id);

    for (let payment of payments) {
      await this.executeExitPayment(payment);
    }
  }

  //
  // To-do [note for Dave]
  // This will make sure that debts for completed hands get processed when the player is leaving immediately
  // through the menu.
  // However, there is still a flaw about the current pot-stake that the player has bet in the live round,
  // since we don't know who the ultimate winner will be.
  //
  // This might be the perfect place for the multisig spendable nfts
  // (or it may be much simpler to put the entire stake in escrow, like that)
  //
  // Or it may be simpler to just simplify exitGame and not give them the opportunity to "Leave Now"
  // and the standard pokerqueue logic will deal them out at the end of the hand for a clean exit
  //
  async executeExitPayment({ receiver, amount, unique_hash, ticker }) {
    amount = this.app.crypto.convertFloatToSmartPrecision(parseFloat(amount));

    //
    // accrued-debt payments have no hash yet -- derive one the same way
    // addPaymentToQueue does, so the wallet can dedupe on it
    //
    if (!unique_hash) {
      this.rollDice();
      let amount_for_unique_hash = amount;
      if (ticker == 'SAITO') {
        amount_for_unique_hash = this.app.wallet
          .convertSaitoToNolan(amount_for_unique_hash)
          .toString();
      }
      unique_hash = this.app.crypto.hash(
        Buffer.from(
          this.publicKey + receiver + amount_for_unique_hash + this.game.dice + ticker,
          'utf-8'
        )
      );
    }

    let sender_crypto_address = '';
    let receiver_crypto_address = '';
    for (let i = 0; i < this.game.players.length; i++) {
      if (this.game.players[i] === this.publicKey) {
        sender_crypto_address = this.game.keys[i];
      }
      if (this.game.players[i] === receiver) {
        receiver_crypto_address = this.game.keys[i];
      }
    }

    if (!sender_crypto_address || !receiver_crypto_address) {
      console.warn(`GTT [settleDebtsOnExit] cannot resolve addresses to pay ${receiver}`);
      return;
    }

    console.info(`GTT [settleDebtsOnExit] paying ${amount} ${ticker} to ${receiver} on exit`);

    //
    // informational overlay -- no mycallback, we await the payment ourselves
    //
    this.app.connection.emit('saito-crypto-send-confirm-open-request', {
      publicKey: receiver,
      address: receiver_crypto_address,
      amount,
      ticker,
      hash: unique_hash,
      game_id: this.game.id,
      trusted: true
    });

    let robj = await this.app.wallet.sendPayment(
      ticker,
      [sender_crypto_address],
      [receiver_crypto_address],
      [amount],
      unique_hash,
      null,
      receiver,
      `${this.name} stake`
    );

    this.app.connection.emit('saito-crypto-send-confirm', robj);
  }

  resetGameWithFewerPlayers() {
    console.log('!!!!!!!!!!!!!!!!!!!!\n', '!!! GAME UPDATED !!!\n', '!!!!!!!!!!!!!!!!!!!!');
    console.log('My Public Key: ' + this.publicKey);
    console.log('My Position: ' + this.game.player);
    console.log('ALL PLAYERS: ' + JSON.stringify(this.game.players));
    console.log('ALL KEYS: ' + JSON.stringify(this.game.keys));
    console.log('saving with id: ' + this.game.id);
    console.log('!!!!!!!!!!!!!!!!!!!!\n', '!!!!!!!!!!!!!!!!!!!!\n', '!!!!!!!!!!!!!!!!!!!!\n');

    this.game.queue = [this.resetCommand];
    this.game.live = true;
    this.saveGame(this.game.id);

    this.reinitializeGameRun(1000);
  }

  exitConfirmationTemplate() {
    return `<div class="saito-modal saito-modal-menu game-exit-menu" id="saito-exit-menu">
            <div class="saito-modal-title">Exit Game / Leave Table</div>
            <div class="saito-modal-content saito-menu-select-heavy">
              <div class="saito-modal-menu-option" id="stay">
                <i class="fa-solid fa-play"></i>
                <div class="option-keyword">Continue playing</div>
              </div>
              <div class="saito-modal-menu-option" id="finish">
                <i class="fa-solid fa-forward-step"></i>
                <div class="option-keyword">Finish Hand<span>--</span><span class="option-explanation">play out the hand and then leave</span></div>
              </div>
              <div class="saito-modal-menu-option" id="forfeit">
                <i class="fa-solid fa-door-open"></i>
                <div class="option-keyword">Leave now<span>--</span><span class="option-explanation">abandon the current hand, settle any debts, and quit the game</span></div>
              </div>
            </div>
          </div>`;
  }

  async exitGame() {
    if (this.game.over == 0 && this.game.player && this.game.options['open-table']) {
      //this.game.state.passed[loser - 1] = 1;

      this.exitOverlay.show(this.exitConfirmationTemplate());
      this.exitOverlay.blockClose();

      let game_self = this;
      $('.saito-modal-menu-option').off();
      $('.saito-modal-menu-option').on('click', async function () {
        let choice = $(this).attr('id');
        game_self.exitOverlay.remove();
        if (choice == 'stay') {
          return;
        }
        if (choice == 'forfeit') {
          //
          // pay any outstanding settlement before we withdraw and navigate away
          //
          await game_self.settleDebtsOnExit();

          await game_self.sendStopGameTransaction('withdraw');
          game_self.game.over = 2;
          game_self.removePlayer(game_self.publicKey);
          game_self.saveGame(game_self.game.id);
          setTimeout(() => {
            //Recursive but will call super because changed the flag
            game_self.exitGame();
          }, 500);
        }
        if (choice == 'finish') {
          game_self.sendMetaMessage('LEAVE');
        }
      });
    } else {
      super.exitGame();
    }
  }

  /**
   * Definition of core gaming logic commands
   */
  initializeQueueCommands() {
    //Take all Game Engine Commands
    super.initializeQueueCommands();

    this.commands.unshift((game_self, gmv) => {
      if (gmv[0] === this.resetCommand) {
        //
        // record the consensus commitment for this snapshot round -- every
        // client (including a pending joiner) executes this at an identical
        // point in the queue, so the commitments are directly comparable
        //
        if (!this.game.state_commitments) {
          this.game.state_commitments = {};
        }
        this.game.state_commitments[this.currentRound()] = this.returnStateCommitment(this.game);
        this.pruneStateCommitments();

        if (this.game.player) {
          let snapshot = this.buildBoundarySnapshot();

          //
          // sign any join requests we deferred for lack of a snapshot
          //
          for (let pkey in this.joining) {
            if (pkey !== this.publicKey && !this.joining[pkey].sigs?.[this.publicKey]) {
              this.signJoinRequest(pkey);
            }
          }

          //
          // send any state share we deferred (reuse the serialized snapshot)
          //
          if (this.share_state_on_snapshot) {
            this.share_state_on_snapshot = false;
            this.sendMetaMessage('SHARE', snapshot);
          }
        } else if (this.game.pending_join) {
          //
          // re-check any sigs whose round we have just caught up to
          //
          this.verifyPendingJoin();
        }
      }
      return 1;
    });

    //Add some more ones
    this.commands.push((game_self, gmv) => {
      if (gmv[0] === 'ADDPLAYER') {
        let pkey = gmv[1];

        game_self.game.queue.splice(game_self.game.queue.length - 1, 1);

        console.info('GTT: Adding ' + pkey + ' to game');

        this.addPlayerLate(pkey); // Adds player to game
        this.addPlayerToState(pkey);
        this.updateLog('================');
        this.updateLog(
          `${this.app.keychain.returnUsername(pkey)} joins the table as Player ${
            this.game.players.length
          }`
        );
        if (pkey === this.publicKey) {
          this.finalizePendingJoin();
        } else if (this.game.player === 1) {
          //
          // a joiner was seated but has not followed the game -- one seated
          // player (seat 1) shares the post-seat boundary snapshot at the next
          // newround so they can adopt their seat via state handoff
          //
          this.share_state_on_snapshot = true;
        }

        // Clear toJoin
        for (let j = this.toJoin.length - 1; j >= 0; j--) {
          if (this.toJoin[j] == pkey) {
            this.toJoin.splice(j, 1);
          }
        }

        delete this.joining[pkey];
      }
      return 1;
    });

    this.commands.push((game_self, gmv) => {
      if (gmv[0] === 'REMOVEPLAYER') {
        let pkey = gmv[1];

        game_self.game.queue.splice(game_self.game.queue.length - 1, 1);

        console.info('GTT: Removing ' + pkey + ' from game');
        let i = this.game.players.indexOf(pkey);

        this.updateLog(
          `Player ${i + 1} (${this.app.keychain.returnUsername(pkey)}) leaves the table.`
        );
        this.removePlayer(pkey);

        if (pkey == this.publicKey) {
          this.updateStatusForPlayerOut('You cashed out of the table game');
        }
      }
      return 1;
    });

    this.commands.push((game_self, gmv) => {
      if (gmv[0] === 'RESTARTGAME') {
        this.toLeave = [];

        game_self.game.queue.splice(game_self.game.queue.length - 1, 1);

        if (game_self.game.players.length === 1) {
          this.game.queue.push('checkplayers');
          return 1;
        }

        this.halted = 1;

        this.resetGameWithFewerPlayers();
        return 0;
      }
      return 1;
    });

    this.commands.push((game_self, gmv) => {
      if (gmv[0] === 'PLAYERS') {
        console.log(
          'GTT: PLAYERS:',
          JSON.parse(JSON.stringify(this.toJoin)),
          JSON.parse(JSON.stringify(this.joining))
        );

        let change = this.toLeave.length + this.toJoin.length > 0;

        game_self.game.queue.splice(game_self.game.queue.length - 1, 1);

        if (change) {
          let player_to_send = 0;
          for (let i = 0; i < this.game.players.length; i++) {
            if (!this.toLeave.includes(this.game.players[i])) {
              player_to_send = i + 1;
              break;
            }
          }

          //Player one handles the move
          if (this.game.player == player_to_send) {
            let player_count = this.game.players.length;

            this.addMove('RESTARTGAME');

            for (let pkey of this.toLeave) {
              if (this.game.players.includes(pkey)) {
                this.addMove(`REMOVEPLAYER\t${pkey}`);
                player_count--;
              }
            }

            for (let i = 0; i < this.toJoin.length && player_count++ < this.maxPlayers; i++) {
              let pkey = this.toJoin[i];
              this.addMove(`ADDPLAYER\t${pkey}`);
            }

            this.endTurn();
          }

          return 0;
        }
      }
      return 1;
    });
  }
}

module.exports = GameTableTemplate;
