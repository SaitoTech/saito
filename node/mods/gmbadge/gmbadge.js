'use strict';

const ModTemplate = require('./../../lib/templates/modtemplate');
const SaitoHeader = require('./../../lib/saito/ui/saito-header/saito-header');
const SaitoOverlay = require('./../../lib/saito/ui/saito-overlay/saito-overlay');
const PeerService = require('saito-js/lib/peer_service').default;
const Streaks = require('./lib/streaks');
const BadgeSVG = require('./lib/badge-svg');
const P2PIndex = require('./lib/p2p-index');
const BadgeDecorator = require('./lib/ui/badge-decorator');
const GMBadgeMain = require('./lib/ui/gmbadge-main');
const STYLES = require('./lib/ui/styles');

//
// GMBadge
//
// Say "gm" in Red Square once a day and earn a badge NFT that grows with
// your streak. Works in two modes:
//
//   p2p   (default, no server) every wallet reads gm history straight from
//         the Archive of the node it is connected to, computes streaks with
//         the same rules, and mints its own badge. Installable as a .saito
//         app through the wallet's "Add App" menu.
//
//   index (optional) a node running this module advertises the `gmbadge`
//         service, keeps a SQLite index, assigns serials, and mints badges
//         from its own wallet as the issuer. Wallets prefer this when present.
//
// NFT type: "gm" (slip3 label). The streak is always derived from on-chain
// Red Square posts, so the badge's tier is recomputable by anyone.
//
class GMBadge extends ModTemplate {
  constructor(app) {
    super(app);

    this.name = 'GMBadge';
    this.slug = 'gmbadge';
    this.description = 'Say gm in Red Square every day. Earn a verifiable streak badge NFT.';
    this.categories = 'Social Utilities';
    this.icon_fa = 'fa-solid fa-circle-check';
    this.publisher_message =
      'gm fam. Say gm once a day in Red Square. Your badge grows with your streak and anyone can verify it from the chain.';
    this.status = 'beta';
    this.class = 'utility';
    this.nft_type = 'gm';
    this.styles = ['/gmbadge/style.css'];

    // node-side issuer settings. Overridable via app.options.gmbadge
    this.config = {
      mint: true,
      deposit_saito: 1, // SAITO locked in the badge so ATR keeps it alive
      fee_saito: 0, // mint tx fee; set > 0 on mainnet so routers include the mint
      issuer: '', // optional pinned issuer public key (browser side)
      max_states: 2000
    };

    this.mode = 'p2p';
    this.states = {}; // publickey -> state (from index service or p2p)
    this.today = Streaks.dayIndex(Date.now());
    this.peer = null;
    this.issuer = '';
    this.p2p = null;
    this.decorator = null;
    this.main = null;
    this.header = null;
    this.overlay = null;
    this.refresh_timer = null;
    this.p2p_refresh_timer = null;
    this.p2p_seen = new Set();
    this.styles_injected = false;
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
      this.injectStyles();
      this.p2p = new P2PIndex(app, this);
      this.decorator = new BadgeDecorator(app, this);
      this.decorator.start();
      this.refresh_timer = setInterval(() => this.refreshStates(), 5 * 60 * 1000);
    }
  }

  injectStyles() {
    if (this.styles_injected || typeof document === 'undefined') {
      return;
    }
    if (document.getElementById('gmbadge-styles')) {
      this.styles_injected = true;
      return;
    }
    const style = document.createElement('style');
    style.id = 'gmbadge-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
    this.styles_injected = true;
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
    if (this.app.browser?.returnURLParameter?.('p2p')) {
      return; // dev switch: force p2p mode even when an index service exists
    }
    this.peer = peer;
    this.mode = 'index';
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
        if (this.mode === 'p2p' && this.p2p) {
          delete this.p2p.cache[publickey];
          this.p2p.stateFor(publickey, true).then((st) => this.absorbP2P(publickey, st));
        } else if (publickey === this.publicKey) {
          setTimeout(() => this.refreshStates(), 2000);
        }
        return;
      }

      await this.receiveGm(publickey, day, String(tx.signature), ts, Number(blk?.id || 0));
      return;
    }

    //
    // a badge mint confirming (issuer mint or self mint)
    //
    if (txmsg.module === this.name && txmsg.request === 'mint badge') {
      const holder = txmsg.data?.publickey ? String(txmsg.data.publickey) : '';
      if (this.app.BROWSER) {
        if (holder && holder === this.publicKey) {
          try {
            await this.app.wallet.updateNFTList();
          } catch (err) {}
          setTimeout(() => {
            this.refreshStates();
            this.rerender();
          }, 2000);
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

  mintMessage(state, mode) {
    return {
      module: this.name,
      request: 'mint badge',
      title: state.serial != null ? `gm badge #${state.serial}` : 'gm badge',
      description: `Earned by saying gm in Red Square on ${Streaks.dayString(state.first_day)}. The tier is recomputed from on-chain gm posts.`,
      data: {
        publickey: state.publickey,
        serial: state.serial,
        first_day: state.first_day,
        first_date: Streaks.dayString(state.first_day),
        issuer: this.publicKey,
        mode,
        image: BadgeSVG.renderDataUri({ tier: 1, streak: 1, serial: state.serial, size: 256 })
      }
    };
  }

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
        console.error(`GMBadge: issuer balance too low to mint badge #${state.serial}`);
        return;
      }
      const tx = await this.app.wallet.createMintNFTTransaction(
        BigInt(1),
        deposit,
        this.mintMessage(state, 'issuer'),
        fee,
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

  //
  // p2p mode: the holder mints their own badge from their own wallet.
  // Returns { ok, reason }.
  //
  async mintMyBadge() {
    const me = this.publicKey;
    if (!this.app.BROWSER || !me) {
      return { ok: false, reason: 'no wallet' };
    }
    if (await this.ownBadge()) {
      return { ok: false, reason: 'You already hold a gm badge.' };
    }
    const state = this.p2p ? await this.p2p.stateFor(me, true) : null;
    if (!state || !state.lifetime) {
      return {
        ok: false,
        reason: 'Say gm in Red Square first. Your badge needs at least one on-chain gm.'
      };
    }
    this.absorbP2P(me, state);
    try {
      const balance = BigInt(await this.app.wallet.getBalance());
      const oneSaito = BigInt(this.app.wallet.convertSaitoToNolan(1));
      const deposit = balance >= oneSaito * BigInt(2) ? oneSaito : BigInt(0);
      const tx = await this.app.wallet.createMintNFTTransaction(
        BigInt(1),
        deposit,
        this.mintMessage(state, 'self'),
        BigInt(0),
        me,
        this.nft_type
      );
      await tx.sign();
      await this.app.network.propagateTransaction(tx);
      return {
        ok: true,
        reason:
          deposit > BigInt(0)
            ? 'Minting your badge with a 1 SAITO deposit so it pays its own rent. It appears once the block confirms.'
            : 'Minting your badge with no deposit (wallet below 2 SAITO). It will need a top-up before the next rent cycle.'
      };
    } catch (err) {
      console.error('GMBadge: self mint failed', err);
      return { ok: false, reason: 'Mint failed. Check that your wallet has a little SAITO.' };
    }
  }

  async ownBadge() {
    try {
      await this.app.wallet.updateNFTList();
    } catch (err) {}
    const list = this.app.options?.wallet?.nfts || [];
    for (const nft of list) {
      const type = this.app.wallet.extractNFTType(nft?.slip3?.utxo_key || '');
      if (type === this.nft_type) {
        return nft;
      }
    }
    return null;
  }

  //
  // 33-byte NFT id = block_id(8) + tx_ordinal(8) + slip_index(1) + type(16).
  // The block id doubles as a proof of when the badge was minted.
  //
  mintBlockOf(nft) {
    const id = String(nft?.id || '');
    if (/^[0-9a-fA-F]{66}$/.test(id)) {
      return parseInt(id.slice(0, 16), 16);
    }
    return null;
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

    if (txmsg.request === 'gmbadge: states' || txmsg.request === 'gmbadge: leaderboard') {
      const limit =
        txmsg.request === 'gmbadge: states'
          ? this.config.max_states
          : Number(txmsg.data?.limit) || 100;
      const rows = await this.queryStates(limit);
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
      badge_sig: row.badge_sig || '',
      source: 'index'
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
        const today = Streaks.dayIndex(Date.now());
        const rows = await self.queryStates(Number(req.query.limit) || 100);
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

  //
  // State lookup used by the decorator, the page and the NFT card.
  // In p2p mode an unknown key triggers a background fetch; the decorator
  // redraws when it lands.
  //
  viewFor(publickey) {
    const state = this.states[publickey];
    if (state) {
      return Streaks.view(state, this.today);
    }
    if (this.mode === 'p2p' && this.p2p && !this.p2p_seen.has(publickey)) {
      this.p2p_seen.add(publickey);
      this.p2p.stateFor(publickey).then((st) => this.absorbP2P(publickey, st));
    }
    return null;
  }

  absorbP2P(publickey, state) {
    if (!state) {
      return;
    }
    this.states[publickey] = state;
    this.today = Streaks.dayIndex(Date.now());
    clearTimeout(this.p2p_refresh_timer);
    this.p2p_refresh_timer = setTimeout(() => {
      this.decorator?.refresh();
      this.rerender();
    }, 400);
  }

  async refreshStates() {
    if (!this.app.BROWSER) {
      return;
    }
    if (this.mode === 'p2p' || !this.peer) {
      if (this.p2p && this.publicKey) {
        const st = await this.p2p.stateFor(this.publicKey, true);
        this.absorbP2P(this.publicKey, st);
      }
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
          this.rerender();
        },
        this.peer.publicKey
      );
    } catch (err) {
      console.error('GMBadge: refresh failed', err);
    }
  }

  leaderboard(limit = 100) {
    return Object.values(this.states)
      .filter((s) => s && s.lifetime > 0)
      .sort((a, b) => {
        const av = Streaks.view(a, this.today).streak;
        const bv = Streaks.view(b, this.today).streak;
        return bv - av || b.lifetime - a.lifetime || (a.serial || 1e9) - (b.serial || 1e9);
      })
      .slice(0, limit);
  }

  rerender() {
    if (this.main && (this.browser_active || this.overlay)) {
      this.main.render();
    }
  }

  //
  // /gmbadge page (node mode)
  //
  async render() {
    if (!this.browser_active) {
      return;
    }
    if (!this.main) {
      this.main = new GMBadgeMain(this.app, this, '.gmbadge-page');
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.addComponent(this.header);
    }
    await super.render();
    await this.main.render();
    this.refreshStates();
  }

  //
  // Overlay (installed-app mode, works inside any Saito wallet)
  //
  async openOverlay() {
    this.injectStyles();
    if (!this.overlay) {
      this.overlay = new SaitoOverlay(this.app, this, true, false);
    }
    this.overlay.show('<div class="gmbadge-page gmbadge-overlay"></div>');
    this.main = new GMBadgeMain(this.app, this, '.gmbadge-overlay');
    await this.main.render();
    this.refreshStates();
  }

  //
  // Authenticity. In index mode a real badge satisfies all of:
  //   1. slip1 creator == the issuer key announced by the gmbadge service
  //   2. the serial in the mint message matches the index's serial for that holder
  // In p2p mode (no issuer) a badge is genuine when it is self-minted
  // (creator == holder) and the holder has on-chain gm history.
  // The inline decorator never consults NFTs at all; it draws from the index.
  //
  verifyBadge({ creator = '', serial = null, holder = '' } = {}) {
    const state = this.states[holder];
    if (!this.issuer) {
      if (creator && holder && creator !== holder) {
        return { ok: false, reason: 'COUNTERFEIT: badge was not minted by its holder' };
      }
      if (state && !state.lifetime) {
        return { ok: false, reason: 'COUNTERFEIT: holder has no on-chain gm history' };
      }
      return {
        ok: true,
        reason: state ? 'verified from on-chain gm history' : 'self-minted; history loading'
      };
    }
    if (!creator || creator !== this.issuer) {
      if (creator && creator === holder && state?.lifetime) {
        return { ok: true, reason: 'self-minted, verified from on-chain gm history' };
      }
      return { ok: false, reason: 'COUNTERFEIT: not minted by the gm badge issuer' };
    }
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

  respondTo(type = '', obj = null) {
    if (type === 'saito-header') {
      const self = this;
      if (this.browser_active) {
        return [];
      }
      return [
        {
          text: 'gm badge',
          icon: this.icon_fa,
          rank: 60,
          type: 'navigation',
          callback: function (app, id) {
            self.openOverlay();
          }
        }
      ];
    }

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
              issuer: self.issuer || creator,
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
              issuer: self.issuer || creator,
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
