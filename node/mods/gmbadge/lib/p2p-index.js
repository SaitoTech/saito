'use strict';

const Streaks = require('./streaks');

//
// Peer-to-peer streak index. No gm badge server required.
//
// Every Red Square post is an on-chain transaction that the node a wallet is
// connected to keeps in its Archive. This class pages a public key's posts out
// of that archive, keeps the ones that say gm, and replays them through the
// same streak rules the node-side indexer uses. Any wallet can therefore
// compute anyone's streak from the chain itself.
//
class P2PIndex {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.cache = {}; // publickey -> { state, at }
    this.inflight = {}; // publickey -> Promise
    this.ttl_ms = 10 * 60 * 1000;
    this.page = 100;
    this.max_pages = 12;
    this.max_age_ms = 400 * Streaks.DAY_MS;
    this.timeout_ms = 15000;
  }

  cached(publickey) {
    const hit = this.cache[publickey];
    if (hit && Date.now() - hit.at < this.ttl_ms) {
      return hit.state;
    }
    return null;
  }

  async stateFor(publickey, force = false) {
    if (!publickey) {
      return null;
    }
    if (!force) {
      const hit = this.cached(publickey);
      if (hit) {
        return hit;
      }
    }
    if (this.inflight[publickey]) {
      return this.inflight[publickey];
    }
    const p = this.build(publickey)
      .catch((err) => {
        console.warn('GMBadge: p2p index failed for', publickey, err);
        return null;
      })
      .then((state) => {
        delete this.inflight[publickey];
        if (state) {
          this.cache[publickey] = { state, at: Date.now() };
        }
        return state;
      });
    this.inflight[publickey] = p;
    return p;
  }

  async build(publickey) {
    const days = await this.fetchGmDays(publickey);
    if (!days.length) {
      return Object.assign(Streaks.emptyState(publickey), { source: 'p2p' });
    }
    let state = Streaks.emptyState(publickey);
    for (const day of days) {
      state = Streaks.applyGm(state, day).state;
    }
    state.source = 'p2p';
    state.serial = null;
    return state;
  }

  //
  // Page the key's Red Square posts newest-first until the archive runs dry,
  // the page cap is hit, or we are past max_age. Return ascending unique days.
  //
  async fetchGmDays(publickey) {
    const days = new Set();
    let earlier = Date.now() + 60000;
    const floor = Date.now() - this.max_age_ms;

    for (let i = 0; i < this.max_pages; i++) {
      const txs = await this.load({
        field1: 'RedSquare',
        field2: publickey,
        created_earlier_than: earlier,
        limit: this.page
      });
      if (!txs.length) {
        break;
      }
      let oldest = earlier;
      for (const tx of txs) {
        const ts = Number(tx.timestamp) || 0;
        if (ts && ts < oldest) {
          oldest = ts;
        }
        let msg = null;
        try {
          msg = tx.returnMessage();
        } catch (err) {
          msg = tx.msg;
        }
        if (msg?.request !== 'create tweet') {
          continue;
        }
        const from = tx.from?.[0]?.publicKey ? String(tx.from[0].publicKey) : '';
        if (from && from !== publickey) {
          continue;
        }
        if (Streaks.isGm(msg.data?.text) && ts) {
          days.add(Streaks.dayIndex(ts));
        }
      }
      if (txs.length < this.page || oldest <= floor || oldest >= earlier) {
        break;
      }
      earlier = oldest;
    }
    return Array.from(days).sort((a, b) => a - b);
  }

  load(query) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) {
          done = true;
          resolve([]);
        }
      }, this.timeout_ms);
      try {
        this.app.storage.loadTransactions(query, (txs) => {
          if (!done) {
            done = true;
            clearTimeout(timer);
            resolve(Array.isArray(txs) ? txs : []);
          }
        });
      } catch (err) {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve([]);
        }
      }
    });
  }
}

module.exports = P2PIndex;
