'use strict';

const ModTemplate = require('./../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const PeerService = require('saito-js/lib/peer_service').default;
const Streaks = require('./lib/streaks');
const BadgeSVG = require('./lib/badge-svg');
const BadgeDecorator = require('./lib/ui/badge-decorator');
const GMBadgeMain = require('./lib/ui/gmbadge-main');

//
// GMBadge
//
// Say "gm" in Red Square once a day and earn a badge NFT that grows with
// your streak. The node indexes every Red Square post, computes streaks,
// mints the badge on a holder's first gm, and serves streak state to
// browsers. The browser draws badges next to usernames everywhere.
//
// NFT type: "gm" (slip3 label). One badge per public key, quantity 1.
// The streak is derived from on-chain Red Square posts, so the badge's
// look is recomputable by anyone; the NFT is the credential and serial.
//
class GMBadge extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'GMBadge';
    this.slug = 'gmbadge';
    this.description = 'Say gm in Red Square every day. Earn a verifiable streak badge.';
    this.categories = 'Social Utilities';
    this.nft_type = 'gm';
    this.styles = ['/gmbadge/style.css'];

    // issuer settings (node side). Overridable via app.options.gmbadge
    this.config = {
      mint: true,
      deposit_saito: 1, // SAITO locked in the badge so ATR keeps it alive
      fee_saito: 0, // mint tx fee; set > 0 on mainnet so routers include the mint
      issuer: '', // optional pinned issuer public key (browser side); overrides what a node announces
      max_states: 2000
    };

    // browser-side cache of streak states keyed by public key
    this.states = {};
    this.today = Streaks.dayIndex(Date.now());
    this.peer = null;
    this.issuer = ''; // issuer public key announced by the gmbadge service
    this.decorator = null;
    this.main = null;
    this.header = null;
    this.refresh_timer = null;
  }

  async initialize(app) {
    await super.initialize(app);

    if (app.options?.gmbadge && typeof app.options.gmbadge === 'object') {
      Object.assign(this.config, app.options.gmbadge);
    }
    if (this.config.issuer) {
      this.issuer = String(this.config.issuer);
    }

    if (app.BROWSER) {
      this.decorator = new BadgeDecorator(app, this);
      this.decorator.start();
      this.refresh_timer = setInterval(() => this.refreshStates(), 5 * 60 * 1000);
    }
  }

  //////////////////
  // Services     //
  //////////////////

  returnServices() {
    const services = [];
    if (this.app.BROWSER == 0) {
      services.push(new PeerService(null, 'gmbadge'));
    }
    return services;
  }

  async onPeerServiceUp(app, peer, service = {}) {
    if (!app.BROWSER || service.service !== 'gmbadge') {
      return;
    }
    this.peer = peer;
    await this.refreshStates();
  }

  //
  // We want every Red Square transaction, not only our own.
  //
  shouldAffixCallbackToModule(modname, tx = null) {
    if (modname === 'RedSquare' || modname === this.name) {
      return 1;
    }
    return 0;
  }

  //////////////////
  // On-chain     //
  //////////////////

  async onConfirmation(blk, tx, conf) {
    if (Number(conf) !== 0) {
      return; // confirmations arrive as BigInt; only act on the first
    }
    const txmsg = tx.returnMessage();
    if (!txmsg) {
      return;
    }

    //
    // a gm post in Red Square
    //
    if (txmsg.module === 'RedSquare' && txmsg.request === 'create tweet') {
      if (!Streaks.isGm(txmsg.data?.text)) {
        return;
      }
      const publickey = tx.from?.[0]?.publicKey ? String(tx.from[0].publicKey) : '';
      if (!publickey) {
        return;
      }
      const ts = Number(blk?.timestamp) || Number(tx.timestamp) || Date.now();
      const day = Streaks.dayIndex(ts);

      if (this.app.BROWSER) {
        if (publickey === this.publicKey) {
          setTimeout(() => this.refreshStates(), 2000);
        }
        return;
      }

      await this.receiveGm(publickey, day, String(tx.signature), ts, Number(blk?.id || 0));
      return;
    }

    //
    // our own badge mint confirming
    //
    if (txmsg.module === this.name && txmsg.request === 'mint badge') {
      const holder = txmsg.data?.publickey ? String(txmsg.data.publickey) : '';
      if (this.app.BROWSER) {
        if (holder && holder === this.publicKey) {
          try {
            await this.app.wallet.updateNFTList();
          } catch (err) {}
          setTimeout(() => this.refreshStates(), 2000);
        }
        return;
      }
      if (holder) {
        await this.app.storage.runDatabase(
          'UPDATE streaks SET minted = 1, badge_sig = ?, updated = ? WHERE publickey = ?',
          [String(tx.signature), Date.now(), holder],
          'gmbadge'
        );
      }
    }
  }

  //////////////////
  // Indexer      //
  //////////////////

  async receiveGm(publickey, day, sig, ts, block_id) {
    let inserted = 0;
    try {
      const res = await this.app.storage.runDatabase(
        'INSERT OR IGNORE INTO gms (publickey, day, sig, ts, block_id) VALUES (?, ?, ?, ?, ?)',
        [publickey, day, sig, ts, block_id],
        'gmbadge'
      );
      inserted = res?.changes || 0;
    } catch (err) {
      console.error('GMBadge: failed to record gm', err);
      return;
    }
    if (!inserted) {
      return; // already said gm today
    }

    const previous = await this.loadState(publickey);
    const { state, duplicate, first, milestone } = Streaks.applyGm(previous, day);
    if (duplicate) {
      return;
    }
    if (first) {
      state.serial = await this.nextSerial();
    }
    await this.saveState(state);

    if (first) {
      await this.mintBadge(state);
    }
    if (milestone) {
      await this.recordMilestone(publickey, milestone, day);
    }
  }

  async loadState(publickey) {
    const rows = await this.app.storage.queryDatabase(
      'SELECT * FROM streaks WHERE publickey = ?',
      [publickey],
      'gmbadge'
    );
    if (rows?.length) {
      return rows[0];
    }
    return Streaks.emptyState(publickey);
  }

  async saveState(s) {
    await this.app.storage.runDatabase(
      `INSERT INTO streaks (publickey, serial, current, longest, lifetime, first_day, last_day, updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(publickey) DO UPDATE SET
         serial = COALESCE(streaks.serial, excluded.serial),
         current = excluded.current,
         longest = excluded.longest,
         lifetime = excluded.lifetime,
         first_day = COALESCE(streaks.first_day, excluded.first_day),
         last_day = excluded.last_day,
         updated = excluded.updated`,
      [
        s.publickey,
        s.serial,
        s.current,
        s.longest,
        s.lifetime,
        s.first_day,
        s.last_day,
        Date.now()
      ],
      'gmbadge'
    );
  }

  async nextSerial() {
    const rows = await this.app.storage.queryDatabase(
      'SELECT COALESCE(MAX(serial), 0) + 1 AS n FROM streaks',
      [],
      'gmbadge'
    );
    return rows?.[0]?.n || 1;
  }

  async recordMilestone(publickey, milestone, day) {
    try {
      await this.app.storage.runDatabase(
        'INSERT OR IGNORE INTO milestones (publickey, milestone, day) VALUES (?, ?, ?)',
        [publickey, milestone, day],
        'gmbadge'
      );
    } catch (err) {}
  }

  //////////////////
  // Issuer       //
  //////////////////

  async mintBadge(state) {
    if (!this.config.mint) {
      return;
    }
    try {
      const deposit = BigInt(
        this.app.wallet.convertSaitoToNolan(Number(this.config.deposit_saito) || 0)
      );
      const fee = BigInt(this.app.wallet.convertSaitoToNolan(Number(this.config.fee_saito) || 0));
      const balance = BigInt(await this.app.wallet.getBalance());
      if (balance < deposit + fee) {
        console.error(
          `GMBadge: issuer balance too low to mint badge #${state.serial} (need ${deposit} nolan)`
        );
        return;
      }

      const txmsg = {
        module: this.name,
        request: 'mint badge',
        title: `gm badge #${state.serial}`,
        description: `Earned by saying gm in Red Square on ${Streaks.dayString(state.first_day)}. Streak tier is recomputed from on-chain gm posts.`,
        data: {
          publickey: state.publickey,
          serial: state.serial,
          first_day: state.first_day,
          first_date: Streaks.dayString(state.first_day),
          issuer: this.publicKey,
          image: BadgeSVG.renderDataUri({ tier: 1, streak: 1, serial: state.serial, size: 256 })
        }
      };

      const tx = await this.app.wallet.createMintNFTTransaction(
        BigInt(1),
        deposit,
        txmsg,
        BigInt(this.app.wallet.convertSaitoToNolan(Number(this.config.fee_saito) || 0)),
        state.publickey,
        this.nft_type
      );
      await tx.sign();
      await this.app.network.propagateTransaction(tx);

      await this.app.storage.runDatabase(
        'UPDATE streaks SET badge_sig = ?, updated = ? WHERE publickey = ?',
        [String(tx.signature), Date.now(), state.publickey],
        'gmbadge'
      );
      console.log(`GMBadge: minted badge #${state.serial} for ${state.publickey}`);
    } catch (err) {
      console.error('GMBadge: mint failed', err);
    }
  }

  //////////////////
  // Peer API     //
  //////////////////

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return 0;
    }
    const txmsg = tx.returnMessage();
    if (!txmsg?.request || app.BROWSER) {
      return super.handlePeerTransaction(app, tx, peer, mycallback);
    }

    if (txmsg.request === 'gmbadge: streak') {
      const publickey = String(txmsg.data?.publickey || '');
      const state = publickey ? await this.loadState(publickey) : null;
      if (mycallback) {
        mycallback({
          today: Streaks.dayIndex(Date.now()),
          issuer: this.publicKey,
          state: this.publicState(state)
        });
      }
      return 1;
    }

    if (txmsg.request === 'gmbadge: states') {
      const rows = await this.queryStates(this.config.max_states);
      if (mycallback) {
        mycallback({ today: Streaks.dayIndex(Date.now()), issuer: this.publicKey, states: rows });
      }
      return 1;
    }

    if (txmsg.request === 'gmbadge: leaderboard') {
      const rows = await this.queryStates(Number(txmsg.data?.limit) || 100);
      if (mycallback) {
        mycallback({ today: Streaks.dayIndex(Date.now()), issuer: this.publicKey, states: rows });
      }
      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  async queryStates(limit = 100) {
    const today = Streaks.dayIndex(Date.now());
    const rows = await this.app.storage.queryDatabase(
      `SELECT publickey, serial, current, longest, lifetime, first_day, last_day, minted, badge_sig,
              CASE WHEN last_day >= ? THEN current ELSE 0 END AS live
       FROM streaks
       ORDER BY live DESC, lifetime DESC, serial ASC
       LIMIT ?`,
      [today - 1, Math.max(1, Math.min(Number(limit) || 100, 5000))],
      'gmbadge'
    );
    return (rows || []).map((r) => this.publicState(r));
  }

  publicState(row) {
    if (!row) {
      return null;
    }
    return {
      publickey: row.publickey,
      serial: row.serial,
      current: row.current,
      longest: row.longest,
      lifetime: row.lifetime,
      first_day: row.first_day,
      last_day: row.last_day,
      minted: row.minted ? 1 : 0,
      badge_sig: row.badge_sig || ''
    };
  }

  //////////////////
  // HTTP API     //
  //////////////////

  webServer(app, expressapp, express) {
    super.webServer(app, expressapp, express);
    const uri = '/' + encodeURI(this.returnSlug());
    const self = this;

    expressapp.get(`${uri}/api/streak/:publickey`, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const state = await self.loadState(String(req.params.publickey));
        const today = Streaks.dayIndex(Date.now());
        return res.json({
          today,
          issuer: self.publicKey,
          state: self.publicState(state),
          view: Streaks.view(state, today)
        });
      } catch (err) {
        return res.status(500).json({ error: 'unavailable' });
      }
    });

    expressapp.get(`${uri}/api/leaderboard`, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        const limit = Number(req.query.limit) || 100;
        const today = Streaks.dayIndex(Date.now());
        const rows = await self.queryStates(limit);
        return res.json({
          today,
          issuer: self.publicKey,
          rows: rows.map((r) => ({ ...r, view: Streaks.view(r, today) }))
        });
      } catch (err) {
        return res.status(500).json({ error: 'unavailable' });
      }
    });

    expressapp.get(`${uri}/api/badge/:publickey.svg`, async (req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300');
      try {
        const state = await self.loadState(String(req.params.publickey));
        const v = Streaks.view(state, Streaks.dayIndex(Date.now()));
        const size = Math.max(16, Math.min(Number(req.query.size) || 256, 1024));
        res.type('image/svg+xml');
        return res.send(
          BadgeSVG.render({
            tier: v.tier,
            streak: v.streak,
            serial: v.serial,
            issuer: self.publicKey,
            sig: state.badge_sig || '',
            cracked: v.cracked,
            dormant: v.dormant,
            size
          })
        );
      } catch (err) {
        return res.status(500).send('');
      }
    });
  }

  //////////////////
  // Browser      //
  //////////////////

  viewFor(publickey) {
    const state = this.states[publickey];
    if (!state) {
      return null;
    }
    return Streaks.view(state, this.today);
  }

  async refreshStates() {
    if (!this.app.BROWSER || !this.peer) {
      return;
    }
    try {
      await this.app.network.sendRequestAsTransaction(
        'gmbadge: states',
        {},
        (res) => {
          if (!res || !Array.isArray(res.states)) {
            return;
          }
          this.today = Number(res.today) || Streaks.dayIndex(Date.now());
          if (this.config.issuer) {
            this.issuer = String(this.config.issuer); // pinned, ignore what the node says
          } else if (res.issuer) {
            this.issuer = String(res.issuer);
          }
          const next = {};
          for (const row of res.states) {
            if (row?.publickey) {
              next[row.publickey] = row;
            }
          }
          this.states = next;
          this.decorator?.refresh();
          if (this.main && this.browser_active) {
            this.main.leaderboard = res.states.slice(0, 100);
            this.main.render();
          }
        },
        this.peer.publicKey
      );
    } catch (err) {
      console.error('GMBadge: refresh failed', err);
    }
  }

  async render() {
    if (!this.browser_active) {
      return;
    }
    if (!this.main) {
      this.main = new GMBadgeMain(this.app, this);
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
    }
    await super.render();
    this.main.leaderboard = Object.values(this.states)
      .sort((a, b) => {
        const av = Streaks.view(a, this.today).streak;
        const bv = Streaks.view(b, this.today).streak;
        return bv - av || b.lifetime - a.lifetime || (a.serial || 0) - (b.serial || 0);
      })
      .slice(0, 100);
    await this.main.render();
  }

  //
  // Authenticity. A real badge satisfies all of:
  //   1. slip1 creator == the issuer key announced by the gmbadge service
  //   2. the serial in the mint message matches the indexer's serial for that holder
  //   3. the holder in the mint message has an indexed gm history
  // The inline decorator never consults NFTs at all; it draws from the indexer,
  // so a counterfeit NFT can never put a badge next to a username.
  //
  verifyBadge({ creator = '', serial = null, holder = '' } = {}) {
    if (!this.issuer) {
      return { ok: true, reason: 'issuer not yet known; unverified' };
    }
    if (!creator || creator !== this.issuer) {
      return { ok: false, reason: 'COUNTERFEIT: not minted by the gm badge issuer' };
    }
    const state = this.states[holder];
    if (!state) {
      return { ok: true, reason: 'issuer verified; holder not in index yet' };
    }
    if (serial != null && Number(serial) !== Number(state.serial)) {
      return { ok: false, reason: 'COUNTERFEIT: serial does not match the index' };
    }
    return {
      ok: true,
      reason: `verified: issued by ${this.issuer.slice(0, 8)}, serial #${state.serial}`
    };
  }

  //
  // Let the generic wallet NFT card draw a live badge for type "gm"
  //
  respondTo(type = '', obj = null) {
    if (type === 'saito-nft-media') {
      const self = this;
      return {
        class: ['gm'],
        returnMediaDisplay(nft) {
          const data = nft?.data || nft?.txmsg?.data || {};
          const holder = data.publickey || '';
          const creator =
            (typeof nft?.returnCreator === 'function' ? nft.returnCreator() : nft?.creator) || '';
          const v = holder ? self.viewFor(holder) : null;
          const verdict = self.verifyBadge({ creator, serial: data.serial, holder });
          let svg;
          if (!verdict.ok) {
            svg = BadgeSVG.render({ tier: 2, serial: data.serial, counterfeit: true, size: 220 });
          } else if (v) {
            svg = BadgeSVG.render({
              tier: v.tier,
              streak: v.streak,
              serial: v.serial,
              issuer: self.issuer,
              sig: self.states[holder]?.badge_sig || nft?.tx_sig || '',
              cracked: v.cracked,
              dormant: v.dormant,
              size: 220
            });
          } else {
            svg = BadgeSVG.render({
              tier: 1,
              streak: 0,
              serial: data.serial,
              issuer: self.issuer,
              sig: nft?.tx_sig || '',
              size: 220,
              label: false
            });
          }
          return {
            backgroundImage: '',
            innerHtml: `<div class="gm-badge-card${verdict.ok ? '' : ' gm-badge-card-fake'}" title="${self.app.browser.escapeHTML(verdict.reason)}">${svg}</div>`
          };
        }
      };
    }
    return super.respondTo(type, obj);
  }
}

module.exports = GMBadge;
