const Transaction = require('../../../lib/saito/transaction').default;
const Game = require('./robots-game');
const Base58 = require('base-58');
const secp256k1 = require('secp256k1');

const PREFERENCE = 'Robots_level_saves';
const clone = (value) => JSON.parse(JSON.stringify(value));

// Level starts and results are resumable checkpoints. Keep signed, unconfirmed saves
// in the wallet so a failed submission can retry without creating another result.
class LevelSaves {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.peers = new Map();
    this.sending = null;
    this.latest = null;
  }

  get saved() {
    return this.mod.loadGamePreference(PREFERENCE) || { pending: [], latest: null };
  }

  capture() {
    const game = this.mod.game;
    const saved = this.saved;
    const cleared = game.state.run.status === 'cleared';
    const msg = {
      module: this.mod.name,
      request: cleared ? 'roundover' : 'level-save',
      game_id: game.id,
      step: game.step?.game,
      ts: Math.max(
        Date.now(),
        (saved.pending.at(-1)?.msg.ts || 0) + 1,
        (this.latest?.returnMessage().ts || 0) + 1
      ),
      checkpoint: {
        version: 1,
        dice: game.dice,
        run: clone(game.state.run),
        session: clone(game.state.session)
      }
    };
    if (cleared) {
      msg.winner = [this.mod.publicKey];
      msg.players = this.mod.publicKey;
      msg.reason = String(game.state.run.leaderboardPoints);
      if (game.options?.league_id) msg.league_id = game.options.league_id;
    }
    saved.pending.push({ msg });
    this.mod.saveGamePreference(PREFERENCE, saved);
    this.flush();
  }

  flush() {
    if (this.sending) return this.sending;
    this.sending = this.sendPending()
      .catch((error) => {
        console.warn('Robots level save failed:', error);
        if (this.mod.browser_active) {
          this.mod.main.update('LEVEL SAVED LOCALLY — RETRY SYNC FROM GAME MENU');
        }
      })
      .finally(() => {
        this.sending = null;
      });
    return this.sending;
  }

  async sendPending() {
    // Re-read after each await: confirmations may remove an entry during submission.
    const attempted = new Set();
    while (true) {
      const entry = this.saved.pending.find((item) => !attempted.has(item.msg));
      if (!entry) break;
      attempted.add(entry.msg);
      let tx;
      if (entry.transaction) {
        tx = new Transaction(undefined, entry.transaction);
      } else {
        tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee();
        if (!tx) throw new Error('Could not create level transaction');
        tx.addTo(this.mod.publicKey);
        tx.msg = entry.msg;
        await tx.sign();
        if (!tx.signature) throw new Error('Could not sign level transaction');
        entry.transaction = JSON.parse(
          JSON.stringify(tx.toJson(), (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
          )
        );
        const saved = this.saved;
        saved.latest = entry.transaction;
        this.mod.saveGamePreference(PREFERENCE, saved);
      }
      this.consider(tx);
      await this.app.network.propagateTransaction(tx);
      await this.archive(tx, 'localhost');
      for (const peer of this.peers.values()) await this.archive(tx, peer);
    }
    // Retry archive copies even when the result already confirmed on-chain.
    if (!attempted.size && this.latest) {
      await this.archive(this.latest, 'localhost');
      for (const peer of this.peers.values()) await this.archive(this.latest, peer);
    }
  }

  async archive(tx, peer) {
    const metadata = {
      field1: this.mod.name,
      field2: this.mod.publicKey,
      field3: 'level-save',
      preserve: 1
    };
    try {
      const result = await this.app.storage.saveTransaction(tx, metadata, peer);
      if (result?.err) throw new Error('Level archive unavailable');
      // Archive's chain index may already have inserted this signature with
      // default fields. INSERT OR IGNORE alone would leave it undiscoverable.
      const updated = await this.app.storage.updateTransaction(tx, metadata, peer, 1);
      if (updated?.err) throw new Error('Level archive update failed');
    } catch (error) {
      console.warn('Robots checkpoint archive failed:', error);
      if (this.mod.browser_active) this.mod.main.update('ARCHIVE SYNC FAILED — RETRY LEVEL SYNC');
    }
  }

  valid(tx) {
    try {
      tx.generateHashForSignature();
      const signatureValid = secp256k1.verify(
        Buffer.from(tx.getHashForSignature()),
        Buffer.from(tx.signature, 'hex'),
        Buffer.from(Base58.decode(this.mod.publicKey))
      );
      const msg = tx.returnMessage();
      const checkpoint = msg.checkpoint;
      const run = checkpoint?.run;
      const cleared = msg.request === 'roundover' && run?.status === 'cleared';
      const started = msg.request === 'level-save' && run?.status === 'playing';
      const cell = (p) =>
        p &&
        Number.isInteger(p.x) &&
        Number.isInteger(p.y) &&
        p.x >= 0 &&
        p.x < 25 &&
        p.y >= 0 &&
        p.y < 19;
      return (
        msg.module === this.mod.name &&
        (cleared || started) &&
        tx.from[0]?.publicKey === this.mod.publicKey &&
        tx.isTo(this.mod.publicKey) &&
        checkpoint?.version === 1 &&
        typeof checkpoint.dice === 'string' &&
        checkpoint.dice.length > 0 &&
        Number.isSafeInteger(msg.ts) &&
        run.width === 25 &&
        run.height === 19 &&
        Number.isSafeInteger(run.wave) &&
        run.wave > 0 &&
        run.clearedWaves === run.wave - (started ? 1 : 0) &&
        run.leaderboardPoints === Game.leaderboardPoints(run.clearedWaves) &&
        ['score', 'turns', 'kills', 'bonus'].every((key) => Number.isSafeInteger(run[key])) &&
        cell(run.player) &&
        Array.isArray(run.robots) &&
        run.robots.length === (started ? Math.min(10 + (run.wave - 1) * 5, 100) : 0) &&
        run.robots.every(cell) &&
        Array.isArray(run.fires) &&
        run.fires.length <= 475 &&
        run.fires.every(cell) &&
        (!started || (run.fires.length === 0 && run.bonus === 0)) &&
        ['round', 'wins', 'losses'].every(
          (key) => Number.isSafeInteger(checkpoint.session?.[key]) && checkpoint.session[key] >= 0
        ) &&
        signatureValid
      );
    } catch (_) {
      return false;
    }
  }

  consider(tx) {
    if (!this.valid(tx)) return false;
    if (!this.latest || tx.returnMessage().ts > this.latest.returnMessage().ts) this.latest = tx;
    return true;
  }

  async load(peer = 'localhost') {
    const saved = this.saved;
    if (saved.latest) this.consider(new Transaction(undefined, saved.latest));
    await this.app.storage.loadTransactions(
      {
        field1: this.mod.name,
        field2: this.mod.publicKey,
        field3: 'level-save',
        limit: 50
      },
      (txs) => {
        for (const tx of txs) this.consider(tx);
      },
      peer
    );
  }

  async connect(peer) {
    this.peers.set(peer.publicKey, peer);
    await this.load(peer);
    // Also copy the last checkpoint if it confirmed before Archive connected.
    if (this.latest) await this.archive(this.latest, peer);
    await this.flush();
  }

  async confirm(tx, conf) {
    if (Number(conf) !== 0 || !this.consider(tx)) return;
    const saved = this.saved;
    saved.pending = saved.pending.filter((entry) => entry.transaction?.signature !== tx.signature);
    saved.latest = JSON.parse(
      JSON.stringify(this.latest.toJson(), (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    );
    this.mod.saveGamePreference(PREFERENCE, saved);
    await this.archive(tx, 'localhost');
  }

  restore(tx = this.latest) {
    if (!tx || !this.valid(tx)) return false;
    const checkpoint = tx.returnMessage().checkpoint;
    // Retain the active Arcade identity and unused payment receipt. Restoring an
    // old receipt could otherwise resurrect a paid jump already consumed later.
    this.mod.game.state.run = clone(checkpoint.run);
    this.mod.game.state.run.safeJumps = 0;
    this.mod.game.state.session = clone(checkpoint.session);
    this.mod.game.dice = checkpoint.dice;
    this.mod.game.queue = ['robots-play'];
    this.mod.game.over = 0;
    this.mod.saveGame(this.mod.game.id);
    return true;
  }
}

module.exports = LevelSaves;
