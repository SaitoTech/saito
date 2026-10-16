const Game = require('./robots-game');

const RECIPIENT = 'i767FqhGcKPzqi7KcWNA8TQoTZeBd8QbWd2mTKNnkfmk';
const PRICE = 100000000n; // 1 native SAITO in nolan.
const REQUEST = 'safe-teleport';

class TeleportPayments {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.sending = false;
  }

  get pending() {
    return this.mod.game.state?.teleportPayment;
  }

  async buy(confirm) {
    if (this.sending) return;
    this.sending = true;
    try {
      const game = this.mod.game;
      let payment = this.pending;
      let tx;
      if (payment) {
        if (['submitted', 'confirmed'].includes(payment.status)) return;
        // A failed/uncertain broadcast must never cause a second charge.
        const Transaction = require('../../../lib/saito/transaction').default;
        tx = new Transaction(undefined, payment.transaction);
      } else {
        if (!Game.landingZones(game.state.run, true).length) {
          throw new Error('NO SAFE LANDING - NO PAYMENT SENT');
        }
        const fee = BigInt(this.app.wallet.default_fee || 0);
        if (!(await this.hasFunds(fee))) return;
        const feeText = this.app.wallet.convertNolanToSaito(fee);
        if (
          !this.mod.loadGamePreference('Robots_skip_teleport_prompt') &&
          !(await confirm(
            `Pay 1 SAITO plus ${feeText} SAITO network fee to ${RECIPIENT} for a safe teleport? Sarah jumps as soon as payment is sent, without waiting for a block confirmation.`
          ))
        )
          return;
        if (game !== this.mod.game || this.pending) return;
        if (!(await this.hasFunds(fee))) return;
        try {
          tx = await this.app.wallet.createUnsignedTransaction(RECIPIENT, PRICE, fee);
        } catch (error) {
          // The wallet can lose spendable inputs between the balance check and creation.
          if (/insufficient SAITO balance/i.test(error.message || '')) {
            this.openGetSaito();
            return;
          }
          throw error;
        }
        tx.msg = { module: this.mod.name, request: REQUEST, game_id: game.id };
        // Ensure the payer also receives the SPV confirmation, even with no change output.
        tx.addTo(this.mod.publicKey);
        await tx.sign();
        if (!tx.signature) throw new Error('PAYMENT COULD NOT BE SIGNED');
        // Game saves use native JSON; transaction slips contain bigint values.
        const transaction = JSON.parse(
          JSON.stringify(tx.toJson(), (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
          )
        );
        payment = {
          gameId: game.id,
          signature: tx.signature,
          status: 'pending',
          transaction
        };
        game.state.teleportPayment = payment;
        this.mod.saveGame(game.id);
      }
      this.mod.main.update('SENDING TELEPORT PAYMENT');
      await this.app.network.propagateTransaction(tx);
      // Submission is sufficient for this local game; confirmation is not a turn barrier.
      if (payment.status === 'pending') payment.status = 'submitted';
      this.mod.saveGame(game.id);
    } finally {
      this.sending = false;
    }
  }

  async hasFunds(fee) {
    if ((await this.app.wallet.getBalance('SAITO')) >= PRICE + fee) return true;
    this.openGetSaito();
    return false;
  }

  openGetSaito() {
    this.mod.main.update('GET SAITO TO BUY A SAFE TELEPORT');
    this.app.connection.emit('saito-purchase-launch');
  }

  // Called only by the module's on-chain confirmation hook, never a relay message.
  confirm(tx, conf) {
    if (!this.app.BROWSER || Number(conf) !== 0) return false;
    const msg = tx.returnMessage();
    if (
      msg.module !== this.mod.name ||
      msg.request !== REQUEST ||
      tx.from[0]?.publicKey !== this.mod.publicKey
    )
      return false;
    let paid = 0n;
    try {
      for (const slip of tx.to) {
        if (slip.publicKey === RECIPIENT) paid += BigInt(slip.amount);
      }
    } catch (_) {
      return false;
    }
    if (paid < PRICE) return false;
    // Arcade can assign a new game ID when resuming a one-player session.
    const matches = (game) =>
      game?.state?.teleportPayment?.gameId === msg.game_id &&
      game.state.teleportPayment.signature === tx.signature;
    const game = matches(this.mod.game)
      ? this.mod.game
      : this.app.options.games?.find((game) => matches(game) && game.module === this.mod.name);
    const payment = game?.state?.teleportPayment;
    if (
      !payment ||
      payment.signature !== tx.signature ||
      !['pending', 'submitted'].includes(payment.status)
    )
      return false;
    payment.status = 'confirmed';
    delete payment.transaction;
    if (game === this.mod.game) this.mod.saveGame(game.id);
    else this.app.storage.saveOptions();
    return game === this.mod.game;
  }

  consume(action, random) {
    const payment = this.pending;
    if (
      !payment ||
      !['submitted', 'confirmed'].includes(payment.status) ||
      action.signature !== payment.signature
    ) {
      return { accepted: false, message: 'SAFE TELEPORT NEEDS A SENT PAYMENT' };
    }
    const run = this.mod.game.state.run;
    run.safeJumps = 1;
    const result = Game.act(run, { type: 'safe' }, random);
    run.safeJumps = 0;
    // Consume the receipt in the same saved game update as the turn. Replays cannot jump twice.
    if (result.accepted) delete this.mod.game.state.teleportPayment;
    return result;
  }
}

module.exports = TeleportPayments;
module.exports.RECIPIENT = RECIPIENT;
module.exports.REQUEST = REQUEST;
