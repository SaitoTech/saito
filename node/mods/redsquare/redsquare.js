const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Transaction = require('../../lib/saito/transaction').default;
const Main = require('./lib/main');
const Manager = require('./lib/manager');
const Tweet = require('./lib/tweet');
const Tweets = require('./lib/tweets');
const Notifications = require('./lib/notifications');
const ComposeOverlay = require('./lib/ui/overlays/compose');
const TweetMenu = require('./lib/ui/overlays/tweet-menu');
const SettingsOverlay = require('./lib/ui/overlays/settings');
const Moderate = require('./lib/ui/moderate');
const SplashTemplate = require('./lib/splash.template');
const index = require('./index');

class RedSquare extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'Red Square';
    this.name = 'RedSquare';
    this.slug = 'redsquare';
    this.description = 'Open Source Twitter-clone for the Saito Network';
    this.categories = 'Social Entertainment';
    this.icon_fa = 'fas fa-square-full';

    //
    // enable shortlinks
    //
    this.shortlinks_enabled = 1;

    this.possibleHome = 1;
    this.use_floating_plus = 1;

    this.allowed_upload_types = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp'];

    //
    // tweet data structures
    //
    this.tweets = {};
    this.tweets_parents = {};
    this.tweets_children = {};
    this.tweets_timeline = [];
    this.tweets_orphans = {};
    this.tweets_loading = {};
    this.profile_tweets = {};
    this.tweet_archive_saves = {};
    this.like_archive_saves = {};
    this.retweet_archive_saves = {};
    this.like_target_updates = {};
    this.tweets_earliest_ts = new Date().getTime();
    this.tweets_latest_ts = 0;

    //
    // notifications data structures
    //
    this.notifications = {};
    this.notifications_timeline = [];
    this.notifications_aggregate = {};
    this.notifications_unread_count = 0;
    this.notifications_last_viewed_ts = 0;
    this.notifications_earliest_like_ts = new Date().getTime();
    this.notifications_earliest_retweet_ts = new Date().getTime();
    this.notifications_latest_ts = 0;
    this.notifications_contact_earliest_ts = {};
    this.notifications_contact_latest_ts = {};

    //
    // This is the default Open Graph Card for Redsquare
    // If we have a link to a specific tweet, we will use a different object to populate the
    // generated html in the webserver
    //
    this.social = {
      twitter: '@SaitoOfficial',
      title: '🟥 Saito RedSquare - Web3 Social Media',
      url: 'https://saito.io/redsquare/',
      description: 'Peer to peer Web3 social media platform',
      image: 'https://saito.tech/wp-content/uploads/2022/04/saito_card.png'
    };

    this.peers = [];

    //
    // UI components
    //
    this.header = null;
    this.main = null;
    this.profile = null;
    this.manager = null;
    this.compose_overlay = new ComposeOverlay(app, this);
    this.tweet_menu = new TweetMenu(app, this);
    this.settings_overlay = new SettingsOverlay(app, this);
    this.moderate = new Moderate(app, this);
    this.moderator_mode = false;

    this.curated = true;
    this.show_splash = true;
    this.poll_block_interval = 5;
    this.blocks_since_poll = 0;

    // Enables banner / description editing via Profile-module events.
    this.enable_profile_edits = true;

    this.styles = ['/saito/saito.css', '/redsquare/style.css'];
    this.postScripts = ['/saito/lib/emoji-picker/emoji-picker.js'];
  }

  returnServices() {
    let services = [];

    if (!this.app.BROWSER || this.offerService) {
      services.push(
        this.app.network.createPeerService(null, 'redsquare', 'RedSquare Tweet Archive')
      );
    }

    return services;
  }

  async initialize(app) {
    await super.initialize(app);

    if (this.publicKey) {
      this.peers.unshift({
        peer: 'localhost',
        publicKey: this.publicKey,
        tweets_earliest_ts: this.tweets_earliest_ts,
        tweets_latest_ts: this.tweets_latest_ts,
        tweets_limit: 10,
        busy: {}
      });
    }

    if (app.BROWSER) {
      this.manager = new Manager(app, this);

      this.app.connection.on('redsquare-new-post', () => {
        this.compose_overlay?.open();
      });

      this.app.connection.on('redsquare-post-tweet', async (data, keys = []) => {
        const tx = await this.createTweetTransaction(data, keys);
        await tx.sign();
        await this.app.network.propagateTransaction(tx);
      });

      const key = this.publicKey || '';
      this.profile = {
        publicKey: key,
        name: key
          ? this.app.keychain.returnUsername(key) || `Anon-${key.slice(0, 6)}`
          : 'Anonymous',
        handle: '',
        bio: '',
        avatar: key
          ? this.app.keychain.returnIdenticon(key) || '/saito/img/dreamscape.png'
          : '/saito/img/dreamscape.png',
        banner: '',
        can_edit: Boolean(this.enable_profile_edits && key)
      };

      this.loadOptions();

      this.app.connection.on('modtools-lists-updated', () => {
        this.applyModerationUpdates();
      });

      this.app.connection.on('modtools-on-server-whitelist', () => {
        this.enterModeratorMode();
      });
    }
  }

  /**
   * Trusted by connected server — load flagged tweets for the review queue.
   */
  async enterModeratorMode() {
    if (!this.app.BROWSER) {
      return;
    }

    this.moderator_mode = true;

    const peers = this.returnTweetArchivePeers();
    const results = await Promise.all(
      peers.map((peer) =>
        this.loadArchiveTransactions({ field1: 'RedSquare', flagged: 1, limit: 10 }, peer)
      )
    );

    const bySignature = new Map();

    for (const txs of results) {
      for (const tx of txs || []) {
        if (!tx) {
          continue;
        }

        if (typeof tx.decryptMessage === 'function') {
          await tx.decryptMessage(this.app);
        }

        const signature = tx.signature != null ? String(tx.signature) : '';

        if (signature && !bySignature.has(signature)) {
          bySignature.set(signature, tx);
        }
      }
    }

    this.moderate.setTransactions(Array.from(bySignature.values()));
    this.updateNotificationBadge();

    if (this.manager?.mode === 'notifications') {
      this.moderate.render(`${this.manager.container} .list[data-panel="notifications"]`);
    }
  }

  /**
   * Re-check stored tweets after ModTools lists change.
   * Marks moderated tweets and refreshes only those nodes — no timeline rebuild.
   */
  applyModerationUpdates() {
    if (!this.app.BROWSER) {
      return;
    }

    const bySignature = new Map();

    for (const tweet of Object.values(this.tweets || {})) {
      if (tweet?.signature) {
        bySignature.set(tweet.signature, tweet);
      }
    }

    for (const tweet of Object.values(this.profile_tweets || {})) {
      if (tweet?.signature && !bySignature.has(tweet.signature)) {
        bySignature.set(tweet.signature, tweet);
      }
    }

    for (const tweet of bySignature.values()) {
      if (!tweet.tx) {
        continue;
      }

      const blocked = this.app.modules?.moderate?.(tweet.tx, this.name) === -1;

      if (blocked === Boolean(tweet.moderated)) {
        continue;
      }

      tweet.moderated = blocked;

      if (!blocked) {
        tweet.moderated_revealed = false;
      }

      if (typeof tweet.refresh === 'function') {
        tweet.refresh();
      }
    }
  }

  loadOptions() {
    if (!this.app.BROWSER) {
      return;
    }

    const rso = this.app.options.redsquare;

    if (!rso) {
      return;
    }

    if (rso.curated === false || rso.curated === 0) {
      this.curated = false;
    }

    this.show_splash = Object.prototype.hasOwnProperty.call(rso, 'show-splash')
      ? rso['show-splash']
      : true;

    if (document?.querySelector) {
      document.querySelector('#saito-container')?.classList.toggle('active-curation', this.curated);
    }
  }

  saveOptions() {
    if (!this.app.BROWSER) {
      return;
    }

    if (!this.app.options.redsquare) {
      this.app.options.redsquare = {};
    }

    this.app.options.redsquare.curated = this.curated;
    this.app.options.redsquare['show-splash'] = this.show_splash;
    this.app.storage.saveOptions();
  }

  //
  // Primary browser startup path — fires when a peer advertising "redsquare" connects.
  // (Saito hook name is onPeerServiceUp, invoked once per peer service.)
  //
  async onPeerServiceUp(app, peer, service = {}) {
    if (!app.BROWSER || !this.browser_active) {
      return;
    }

    if (service.service !== 'redsquare') {
      return;
    }

    this.registerPeer(peer);
    this.manager?.onPeersUpdated?.();
  }

  onNewBlock(blk, lc) {
    if (!this.app.BROWSER || !this.browser_active) {
      this.blocks_since_poll = 0;
      return;
    }

    if (!lc) {
      return;
    }

    this.blocks_since_poll++;

    if (this.blocks_since_poll < this.poll_block_interval) {
      return;
    }

    this.blocks_since_poll = 0;

    if (this.peers.length > 0) {
      this.loadTransactions('tweets', 'newer', (result) => {
        this.manager?.onNewerContentLoaded?.(result, { announce: true });
      });
    }

    if (this.publicKey) {
      this.loadTransactions('notifications', 'newer', (result) => {
        this.manager?.onNewerContentLoaded?.(result);
      });
    }
  }

  registerPeer(peer) {
    const publicKey = peer?.publicKey || '';

    if (!publicKey) {
      return;
    }

    const existing = this.peers.find((p) => p.publicKey === publicKey);

    if (existing) {
      existing.peer = peer;
      return;
    }

    this.peers.push({
      peer,
      publicKey,
      tweets_earliest_ts: new Date().getTime(),
      tweets_latest_ts: 0,
      tweets_limit: 10,
      busy: {}
    });
  }

  //
  // Canonical remote loading entry point.
  //
  loadTransactions(type, direction, callback) {
    if (typeof callback !== 'function') {
      return;
    }

    if (type !== 'tweets' && type !== 'notifications') {
      callback({
        type,
        direction,
        added: [],
        updated: [],
        ignored: [],
        exhausted: true
      });
      return;
    }

    if (direction !== 'older' && direction !== 'newer') {
      callback({
        type,
        direction,
        added: [],
        updated: [],
        ignored: [],
        exhausted: true
      });
      return;
    }

    const isOlder = direction === 'older';

    if (type === 'tweets') {
      const busyKey = `tweets:${direction}`;

      if (!this._load_busy) {
        this._load_busy = {};
      }

      if (this._load_busy[busyKey]) {
        this._load_busy[busyKey].push(callback);
        return;
      }

      this._load_busy[busyKey] = [callback];

      const added = [];
      const new_tweets = [];
      const updated = [];
      const ignored = [];
      const peer_exhausted = [];
      // Polling uses updated_at so liked posts are returned too. Only creation time
      // determines whether a downloaded post is new enough to announce.
      const newest_known_tweet_ts = this.tweets_timeline.reduce((latest, signature) => {
        const tweet = this.getTweet(signature);
        return Math.max(latest, Number(tweet?.created_at) || 0);
      }, 0);
      let peers_remaining = 0;

      const finishTweets = () => {
        const exhausted =
          added.length === 0 && peer_exhausted.length > 0 && peer_exhausted.every(Boolean);
        const result = {
          type,
          direction,
          added: added.slice(),
          new_tweets: new_tweets.slice(),
          updated: updated.slice(),
          ignored: ignored.slice(),
          exhausted
        };
        const callbacks = this._load_busy[busyKey] || [];

        this._load_busy[busyKey] = null;

        for (const cb of callbacks) {
          cb(result);
        }
      };

      const processTweetTxs = (peer_obj, txs, older) => {
        for (let i = 0; i < txs.length; i++) {
          const tx = txs[i];

          if (!tx) {
            continue;
          }

          const working =
            typeof tx.toJson === 'function' ? new Transaction(undefined, tx.toJson()) : tx;

          if (!working) {
            continue;
          }

          if (working !== tx) {
            working.optional =
              tx.optional && typeof tx.optional === 'object' ? { ...tx.optional } : {};
          }

          if (typeof working.decryptMessage === 'function') {
            working.decryptMessage(this.app);
          }

          const signature = working.signature != null ? String(working.signature) : '';

          if (!signature) {
            continue;
          }

          const created_at = Number(tx.timestamp) || Date.now();
          const updated_at = Number(tx.optional?.updated_at) || created_at;
          const hadTweet = this.hasTweet(signature);
          const tweet = this.addTweet(working);

          if (!tweet) {
            if (!ignored.includes(signature)) {
              ignored.push(signature);
            }
          } else if (!hadTweet) {
            if (!added.includes(signature)) {
              added.push(signature);
            }
            if (this.app.BROWSER) {
              this.addNotification(working);
            }
            if (!older && created_at > newest_known_tweet_ts && !new_tweets.includes(signature)) {
              new_tweets.push(signature);
            }
          } else if (!updated.includes(signature)) {
            updated.push(signature);
          }

          if (older && created_at < peer_obj.tweets_earliest_ts) {
            peer_obj.tweets_earliest_ts = created_at;
            this.tweets_earliest_ts = Math.min(
              this.tweets_earliest_ts,
              peer_obj.tweets_earliest_ts
            );
          }

          if (updated_at > peer_obj.tweets_latest_ts) {
            peer_obj.tweets_latest_ts = updated_at;
            this.tweets_latest_ts = Math.max(this.tweets_latest_ts, updated_at);
          }
        }
      };

      const onPeerComplete = (peer_obj, txs, older, peerIndex) => {
        const empty = !txs || txs.length === 0;

        if (empty && older) {
          peer_obj.tweets_earliest_ts = 0;

          if (peer_obj.publicKey === this.publicKey) {
            this.tweets_earliest_ts = 0;
          }
        }

        peer_exhausted[peerIndex] = empty;
        processTweetTxs(peer_obj, txs || [], older);
        peers_remaining--;

        if (peers_remaining <= 0) {
          finishTweets();
        }
      };

      for (let i = 0; i < this.peers.length; i++) {
        const peer_obj = this.peers[i];
        const eligible =
          (isOlder &&
            peer_obj.tweets_earliest_ts >= this.tweets_earliest_ts &&
            peer_obj.tweets_earliest_ts > 0) ||
          (!isOlder && (peer_obj.publicKey !== this.publicKey || peer_obj.peer === 'localhost'));

        if (!eligible) {
          continue;
        }

        const peerIndex = peers_remaining;
        peers_remaining++;
        peer_exhausted[peerIndex] = false;

        if (isOlder && peer_obj.publicKey !== this.publicKey) {
          this.app.network.sendRequestAsTransaction(
            'load tweets',
            { created_earlier_than: peer_obj.tweets_earliest_ts },
            (txs) => {
              const deserialized = [];

              for (let t = 0; t < (txs || []).length; t++) {
                const tx = new Transaction();
                tx.deserialize_from_web(this.app, txs[t]);
                deserialized.push(tx);
              }

              onPeerComplete(peer_obj, deserialized, true, peerIndex);
            },
            peer_obj.peer.publicKey
          );
        } else {
          const obj = {
            field1: 'RedSquare',
            flagged_ne: 1,
            limit: peer_obj.tweets_limit
          };

          if (isOlder) {
            obj.created_earlier_than = peer_obj.tweets_earliest_ts;
          } else {
            obj.updated_later_than = peer_obj.tweets_latest_ts;
          }

          const archivePeer = peer_obj.peer === 'localhost' ? 'localhost' : peer_obj.peer;

          this.app.storage.loadTransactions(
            obj,
            (txs) => {
              onPeerComplete(peer_obj, txs || [], isOlder, peerIndex);
            },
            archivePeer
          );
        }
      }

      if (peers_remaining === 0) {
        const callbacks = this._load_busy[busyKey] || [];
        this._load_busy[busyKey] = null;

        for (const cb of callbacks) {
          cb({
            type,
            direction,
            added: [],
            new_tweets: [],
            updated: [],
            ignored: [],
            exhausted: true
          });
        }
      }

      return;
    }

    //
    // -------------------------------------------------------------------------
    // notifications (localhost archive only)
    // -------------------------------------------------------------------------
    //
    const busyKey = `notifications:${direction}`;

    if (!this._load_busy) {
      this._load_busy = {};
    }

    if (this._load_busy[busyKey]) {
      this._load_busy[busyKey].push(callback);
      return;
    }

    this._load_busy[busyKey] = [callback];

    const collected = [];
    const added = [];
    const updated = [];
    const ignored = [];
    const contactKeys = Array.from(
      new Set(
        (this.app.keychain?.returnKeys?.() || [])
          .map((key) => key?.publicKey)
          .filter((publicKey) => publicKey && publicKey !== this.publicKey)
      )
    );
    const contactArchivePeer = this.peers[0]?.peer || 'localhost';
    let exhausted = false;
    let queries = 0;
    let queries_done = 0;

    const finishNotifications = () => {
      if (collected.length === 0) {
        if (isOlder) {
          this.notifications_earliest_like_ts = 0;
          this.notifications_earliest_retweet_ts = 0;
        }
        exhausted = true;
      }

      for (let z = 0; z < collected.length; z++) {
        const tx = collected[z];

        if (!tx) {
          continue;
        }

        const working =
          typeof tx.toJson === 'function' ? new Transaction(undefined, tx.toJson()) : tx;

        if (!working) {
          continue;
        }

        if (typeof working.decryptMessage === 'function') {
          working.decryptMessage(this.app);
        }

        const signature = working.signature != null ? String(working.signature) : '';

        if (!signature) {
          continue;
        }

        const ts = Number(tx.timestamp) || Date.now();
        const hadNotification = this.hasNotification(signature);
        const notification = this.addNotification(working);

        if (!notification) {
          if (!ignored.includes(signature)) {
            ignored.push(signature);
          }
        } else if (notification.signature === signature && !hadNotification) {
          if (!added.includes(signature)) {
            added.push(signature);
          }
        } else if (notification.signature === signature && hadNotification) {
          if (!updated.includes(signature)) {
            updated.push(signature);
          }
        } else {
          if (!updated.includes(notification.signature)) {
            updated.push(notification.signature);
          }

          if (!ignored.includes(signature)) {
            ignored.push(signature);
          }
        }

        if (isOlder) {
          const txmsg = tx.returnMessage ? tx.returnMessage() : tx.msg || {};

          if (txmsg.request === 'like tweet') {
            if (ts < this.notifications_earliest_like_ts) {
              this.notifications_earliest_like_ts = ts;
            }
          } else if (txmsg.request === 'retweet') {
            if (ts < this.notifications_earliest_retweet_ts) {
              this.notifications_earliest_retweet_ts = ts;
            }
          }
        } else if (ts > this.notifications_latest_ts) {
          this.notifications_latest_ts = ts;
        }
      }

      const result = {
        type,
        direction,
        added: added.slice(),
        updated: updated.slice(),
        ignored: ignored.slice(),
        exhausted
      };
      const callbacks = this._load_busy[busyKey] || [];

      this._load_busy[busyKey] = null;

      for (const cb of callbacks) {
        cb(result);
      }
    };

    const onNotificationQueryDone = () => {
      queries_done++;

      if (queries_done >= queries) {
        finishNotifications();
      }
    };

    if (isOlder) {
      for (const publicKey of contactKeys) {
        if (
          !Object.prototype.hasOwnProperty.call(this.notifications_contact_earliest_ts, publicKey)
        ) {
          this.notifications_contact_earliest_ts[publicKey] = Date.now();
        }

        const earliestTs = this.notifications_contact_earliest_ts[publicKey];

        if (!earliestTs) {
          continue;
        }

        queries++;

        this.app.storage.loadTransactions(
          {
            field1: 'RedSquare',
            field2: publicKey,
            created_earlier_than: earliestTs,
            limit: 10
          },
          (txs) => {
            const rows = txs || [];

            if (rows.length === 0) {
              this.notifications_contact_earliest_ts[publicKey] = 0;
            }

            for (const tx of rows) {
              if (tx.timestamp < this.notifications_contact_earliest_ts[publicKey]) {
                this.notifications_contact_earliest_ts[publicKey] = tx.timestamp;
              }
              collected.push(tx);
            }
            onNotificationQueryDone();
          },
          contactArchivePeer
        );
      }

      if (this.notifications_earliest_like_ts) {
        queries++;

        this.app.storage.loadTransactions(
          {
            field1: 'RedSquareLike',
            field3: this.publicKey,
            created_earlier_than: this.notifications_earliest_like_ts,
            limit: 10
          },
          (txs) => {
            for (const tx of txs || []) {
              if (tx.timestamp < this.notifications_earliest_like_ts) {
                this.notifications_earliest_like_ts = tx.timestamp;
              }
              collected.push(tx);
            }
            onNotificationQueryDone();
          },
          'localhost'
        );
      }

      if (this.notifications_earliest_retweet_ts) {
        queries++;

        this.app.storage.loadTransactions(
          {
            field1: 'RedSquareRetweet',
            field3: this.publicKey,
            created_earlier_than: this.notifications_earliest_retweet_ts,
            limit: 10
          },
          (txs) => {
            for (const tx of txs || []) {
              if (tx.timestamp < this.notifications_earliest_retweet_ts) {
                this.notifications_earliest_retweet_ts = tx.timestamp;
              }
              collected.push(tx);
            }
            onNotificationQueryDone();
          },
          'localhost'
        );
      }
    } else {
      for (const publicKey of contactKeys) {
        const latestTs = this.notifications_contact_latest_ts[publicKey] || 0;

        queries++;

        this.app.storage.loadTransactions(
          {
            field1: 'RedSquare',
            field2: publicKey,
            created_later_than: latestTs,
            limit: 10
          },
          (txs) => {
            for (const tx of txs || []) {
              const ts = Number(tx.timestamp) || 0;

              if (ts > (this.notifications_contact_latest_ts[publicKey] || 0)) {
                this.notifications_contact_latest_ts[publicKey] = ts;
              }

              collected.push(tx);
            }
            onNotificationQueryDone();
          },
          contactArchivePeer
        );
      }

      queries++;

      this.app.storage.loadTransactions(
        {
          field1: 'RedSquareLike',
          field3: this.publicKey,
          updated_later_than: this.notifications_latest_ts,
          limit: 10
        },
        (txs) => {
          for (const tx of txs || []) {
            collected.push(tx);
          }
          onNotificationQueryDone();
        },
        'localhost'
      );

      queries++;

      this.app.storage.loadTransactions(
        {
          field1: 'RedSquareRetweet',
          field3: this.publicKey,
          updated_later_than: this.notifications_latest_ts,
          limit: 10
        },
        (txs) => {
          for (const tx of txs || []) {
            collected.push(tx);
          }
          onNotificationQueryDone();
        },
        'localhost'
      );
    }

    if (queries === 0) {
      const callbacks = this._load_busy[busyKey] || [];
      this._load_busy[busyKey] = null;

      for (const cb of callbacks) {
        cb({
          type,
          direction,
          added: [],
          updated: [],
          ignored: [],
          exhausted: true
        });
      }
    }
  }

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return 0;
    }

    const txmsg = tx.returnMessage();

    if (!txmsg.request) {
      return 0;
    }

    if (!txmsg.module || txmsg.module === this.name) {
      switch (txmsg.request) {
        case 'like tweet':
          await this.receiveLikeTweetTransaction(tx);
          if (mycallback) {
            mycallback({});
          }
          return 1;
        case 'retweet':
          await this.receiveRetweetTransaction(tx);
          if (mycallback) {
            mycallback({});
          }
          return 1;
        case 'flag tweet':
          await this.receiveFlagTweetTransaction(tx);
          if (mycallback) {
            mycallback({});
          }
          return 1;
        case 'review tweet':
          await this.receiveReviewTweetTransaction(tx);
          if (mycallback) {
            mycallback({});
          }
          return 1;
        default:
          break;
      }
    }

    if (txmsg.request === 'load tweets' && txmsg.data?.created_earlier_than != undefined) {
      if (!mycallback) {
        return 0;
      }

      const obj = {
        field1: 'RedSquare',
        flagged_ne: 1,
        limit: 10,
        created_earlier_than: txmsg.data.created_earlier_than
      };

      this.app.storage.loadTransactions(
        obj,
        (txs) => {
          const serialized = [];

          for (const row of txs || []) {
            serialized.push(row.serialize_to_web(this.app));
          }

          mycallback(serialized);
        },
        'localhost'
      );

      return 1;
    }

    return super.handlePeerTransaction(app, tx, peer, mycallback);
  }

  //
  // Tweet transaction construction
  //

  async createTweetTransaction(data = {}, keys = []) {
    const payload = {};

    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        payload[key] = data[key];
      }
    }

    if (payload.text != null) {
      payload.text = String(payload.text);
    }

    if (payload.parent_id != null) {
      payload.parent_id = String(payload.parent_id);
    }

    if (payload.thread_id != null) {
      payload.thread_id = String(payload.thread_id);
    }

    if (payload.images != null) {
      payload.images = Array.isArray(payload.images) ? payload.images.slice() : [payload.images];
    }

    if (payload.mentions != null) {
      payload.mentions = Array.isArray(payload.mentions)
        ? payload.mentions.slice()
        : [payload.mentions];
    }

    const newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = {
      module: this.name,
      request: 'create tweet',
      data: payload
    };

    for (const key of keys) {
      if (key && key !== this.publicKey) {
        newtx.addTo(key);
      }
    }

    return newtx;
  }

  async createLikeTweetTransaction(data = {}, keys = []) {
    const payload = {};

    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        payload[key] = data[key];
      }
    }

    if (payload.signature != null) {
      payload.signature = String(payload.signature);
    }

    const newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = {
      module: this.name,
      request: 'like tweet',
      data: payload
    };

    for (const key of keys) {
      if (key && key !== this.publicKey) {
        newtx.addTo(key);
      }
    }

    return newtx;
  }

  async createRetweetTransaction(data = {}, keys = []) {
    const payload = {};

    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        payload[key] = data[key];
      }
    }

    if (payload.signature != null) {
      payload.signature = String(payload.signature);
    }

    const newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = {
      module: this.name,
      request: 'retweet',
      data: payload
    };

    for (const key of keys) {
      if (key && key !== this.publicKey) {
        newtx.addTo(key);
      }
    }

    return newtx;
  }

  async createFlagTweetTransaction(data = {}, keys = []) {
    const payload = {};

    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        payload[key] = data[key];
      }
    }

    if (payload.signature != null) {
      payload.signature = String(payload.signature);
    }

    const newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = {
      module: this.name,
      request: 'flag tweet',
      data: payload
    };

    for (const key of keys) {
      if (key && key !== this.publicKey) {
        newtx.addTo(key);
      }
    }

    return newtx;
  }

  async createReviewTweetTransaction(data = {}, keys = []) {
    const payload = {};

    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        payload[key] = data[key];
      }
    }

    if (payload.signature != null) {
      payload.signature = String(payload.signature);
    }

    if (payload.decision != null) {
      payload.decision = String(payload.decision);
    }

    const newtx = await this.app.wallet.createUnsignedTransaction();
    newtx.msg = {
      module: this.name,
      request: 'review tweet',
      data: payload
    };

    for (const key of keys) {
      if (key && key !== this.publicKey) {
        newtx.addTo(key);
      }
    }

    return newtx;
  }

  returnInteractionTargetPublicKey(tx) {
    const actorPublicKey = tx?.from?.[0]?.publicKey || '';
    // The wallet's sender output precedes recipients in tx.to.
    const target = tx?.to?.find((slip) => slip?.publicKey && slip.publicKey !== actorPublicKey);

    return target?.publicKey || '';
  }

  async saveTweet(tweet, blk = null) {
    const signature = tweet?.tx?.signature;

    if (!signature || !tweet.thread_id) {
      return;
    }

    const previousSave = this.tweet_archive_saves[signature] || Promise.resolve();
    const archiveSave = previousSave
      .catch(() => {})
      .then(() => this.saveTweetToArchive(tweet, blk));

    this.tweet_archive_saves[signature] = archiveSave;

    try {
      await archiveSave;
    } finally {
      if (this.tweet_archive_saves[signature] === archiveSave) {
        delete this.tweet_archive_saves[signature];
      }
    }
  }

  async saveTweetToArchive(tweet, blk = null) {
    const signature = tweet.tx.signature;

    const archiveOptions = {
      field1: 'RedSquare',
      preserve: 0,
      field4: tweet.parent_id || '',
      field5: tweet.thread_id,
      updated_at:
        Number(tweet.tx.optional?.updated_at) ||
        Number(tweet.updated_at) ||
        Number(tweet.tx.timestamp) ||
        Date.now()
    };
    const targetPublicKey = this.returnInteractionTargetPublicKey(tweet.tx);

    if (tweet.parent_id && targetPublicKey) {
      archiveOptions.field3 = targetPublicKey;
    }

    if (blk) {
      archiveOptions.block_hash = blk.hash;
      archiveOptions.block_id = Number(blk.id);
    }

    const archivedTweets = await this.app.storage.loadTransactions(
      { field1: 'RedSquare', sig: signature },
      (txs) => txs || [],
      'localhost'
    );

    if (archivedTweets?.length) {
      await this.app.storage.updateTransaction(tweet.tx, archiveOptions, 'localhost', 1);
      return;
    }

    await this.app.storage.saveTransaction(tweet.tx, archiveOptions, 'localhost', blk);
  }

  async saveLike(tx, blk = null) {
    const signature = tx?.signature;

    if (!signature) {
      return false;
    }

    const previousSave = this.like_archive_saves[signature] || Promise.resolve();
    const archiveSave = previousSave.catch(() => {}).then(() => this.saveLikeToArchive(tx, blk));

    this.like_archive_saves[signature] = archiveSave;

    try {
      return await archiveSave;
    } finally {
      if (this.like_archive_saves[signature] === archiveSave) {
        delete this.like_archive_saves[signature];
      }
    }
  }

  async saveLikeToArchive(tx, blk = null) {
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';
    const archiveOptions = {
      field1: 'RedSquareLike',
      preserve: 0,
      field3: this.returnInteractionTargetPublicKey(tx),
      field4: targetSignature
    };

    if (blk) {
      archiveOptions.block_hash = blk.hash;
      archiveOptions.block_id = Number(blk.id);
    }

    const archivedLikes = await this.app.storage.loadTransactions(
      { field1: 'RedSquareLike', sig: tx.signature },
      (txs) => txs || [],
      'localhost'
    );

    if (archivedLikes?.length) {
      await this.app.storage.updateTransaction(tx, archiveOptions, 'localhost', 1);
      return false;
    }

    await this.app.storage.saveTransaction(tx, archiveOptions, 'localhost', blk);
    return true;
  }

  async saveRetweet(tx, blk = null) {
    const signature = tx?.signature;
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';

    if (!signature || !targetSignature) {
      return;
    }

    const previousSave = this.retweet_archive_saves[signature] || Promise.resolve();
    const archiveSave = previousSave
      .catch(() => {})
      .then(async () => {
        const archiveOptions = {
          field1: 'RedSquareRetweet',
          preserve: 0,
          field3: this.returnInteractionTargetPublicKey(tx),
          field4: targetSignature
        };

        if (blk) {
          archiveOptions.block_hash = blk.hash;
          archiveOptions.block_id = Number(blk.id);
        }

        const archivedRetweets = await this.app.storage.loadTransactions(
          { field1: 'RedSquareRetweet', sig: signature },
          (txs) => txs || [],
          'localhost'
        );

        if (archivedRetweets?.length) {
          await this.app.storage.updateTransaction(tx, archiveOptions, 'localhost', 1);
          return;
        }

        await this.app.storage.saveTransaction(tx, archiveOptions, 'localhost', blk);
      });

    this.retweet_archive_saves[signature] = archiveSave;

    try {
      await archiveSave;
    } finally {
      if (this.retweet_archive_saves[signature] === archiveSave) {
        delete this.retweet_archive_saves[signature];
      }
    }
  }

  async receiveTweetTransaction(tx, blk = null) {
    const tweet = this.addTweet(tx);

    await this.saveTweet(tweet, blk);

    if (this.app.BROWSER) {
      this.addNotification(tx);
    }

    if (tweet?.parent_id && tweet.parent_id !== tweet.signature) {
      const parent = this.getTweet(tweet.parent_id);
      const interactionTs = Number(tx.timestamp) || Date.now();

      if (parent?.tx) {
        const parentTx = parent.tx;

        if (!parentTx.optional || typeof parentTx.optional !== 'object') {
          parentTx.optional = {};
        }

        const parentTs =
          Number(parent.updated_at) ||
          Number(parentTx.optional.updated_at) ||
          Number(parentTx.timestamp) ||
          0;

        if (interactionTs > parentTs) {
          parentTx.optional.num_replies = Number(parentTx.optional.num_replies) || 0;
          parentTx.optional.num_replies += 1;
          parentTx.optional.updated_at = interactionTs;
          parent.replies = parentTx.optional.num_replies;
          parent.updated_at = interactionTs;

          await this.app.storage.updateTransaction(
            parentTx,
            { updated_at: interactionTs },
            'localhost'
          );

          parent.refreshControls();
        }
      } else {
        await new Promise((resolve) => {
          this.app.storage.loadTransactions(
            { sig: tweet.parent_id, field1: 'RedSquare' },
            async (txs) => {
              if (txs?.length > 0) {
                const parentTx = txs[0];

                if (!parentTx.optional || typeof parentTx.optional !== 'object') {
                  parentTx.optional = {};
                }

                const parentTs =
                  Number(parentTx.optional.updated_at) || Number(parentTx.timestamp) || 0;

                if (interactionTs > parentTs) {
                  parentTx.optional.num_replies = Number(parentTx.optional.num_replies) || 0;
                  parentTx.optional.num_replies += 1;

                  await this.app.storage.updateTransaction(
                    parentTx,
                    { updated_at: interactionTs },
                    'localhost'
                  );
                }
              }

              resolve();
            },
            'localhost'
          );
        });
      }
    }

    return tweet;
  }

  async receiveLikeTweetTransaction(tx, blk = null) {
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';

    if (!targetSignature) {
      return null;
    }

    const previousUpdate = this.like_target_updates[targetSignature] || Promise.resolve();
    const targetUpdate = previousUpdate
      .catch(() => {})
      .then(() => this.applyLikeTweetTransaction(tx, blk, targetSignature));

    this.like_target_updates[targetSignature] = targetUpdate;

    try {
      return await targetUpdate;
    } finally {
      if (this.like_target_updates[targetSignature] === targetUpdate) {
        delete this.like_target_updates[targetSignature];
      }
    }
  }

  async applyLikeTweetTransaction(tx, blk, targetSignature) {
    // Archive signatures deduplicate optimistic delivery and confirmation without
    // preventing the same user from submitting another signed like transaction.
    const isNewLike = await this.saveLike(tx, blk);

    const interactionTs = Number(tx.timestamp) || Date.now();
    const likerKey =
      tx.from && tx.from[0] && tx.from[0].publicKey ? String(tx.from[0].publicKey) : '';
    const tweet = this.getTweet(targetSignature);

    if (tweet?.tx) {
      const targetTx = tweet.tx;

      if (!targetTx.optional || typeof targetTx.optional !== 'object') {
        targetTx.optional = {};
      }

      const targetTs =
        Number(tweet.updated_at) ||
        Number(targetTx.optional.updated_at) ||
        Number(targetTx.timestamp) ||
        0;
      const likers = Array.isArray(targetTx.optional.likers) ? targetTx.optional.likers : [];

      if (isNewLike) {
        targetTx.optional.num_likes = Number(targetTx.optional.num_likes) || 0;
        targetTx.optional.num_likes += 1;

        if (likerKey && !likers.includes(likerKey)) {
          likers.unshift(likerKey);
          targetTx.optional.likers = likers;
        }

        // Archive polling uses a strict updated_later_than cursor.
        const updatedAt = Math.max(targetTs + 1, interactionTs);
        targetTx.optional.updated_at = updatedAt;
        tweet.likes = targetTx.optional.num_likes;
        tweet.likers = likers.slice();
        tweet.updated_at = updatedAt;

        // Peer-loaded tweets may not exist in the local archive yet.
        await this.saveTweet(tweet);

        tweet.refreshControls();
      }
    } else {
      await new Promise((resolve) => {
        this.app.storage.loadTransactions(
          { sig: targetSignature, field1: 'RedSquare' },
          async (txs) => {
            if (txs?.length > 0) {
              const targetTx = txs[0];

              if (!targetTx.optional || typeof targetTx.optional !== 'object') {
                targetTx.optional = {};
              }

              const targetTs =
                Number(targetTx.optional.updated_at) || Number(targetTx.timestamp) || 0;
              const likers = Array.isArray(targetTx.optional.likers)
                ? targetTx.optional.likers
                : [];

              if (isNewLike) {
                targetTx.optional.num_likes = Number(targetTx.optional.num_likes) || 0;
                targetTx.optional.num_likes += 1;

                if (likerKey && !likers.includes(likerKey)) {
                  likers.unshift(likerKey);
                  targetTx.optional.likers = likers;
                }

                const updatedAt = Math.max(targetTs + 1, interactionTs);

                await this.app.storage.updateTransaction(
                  targetTx,
                  { updated_at: updatedAt },
                  'localhost'
                );
              }
            }

            resolve();
          },
          'localhost'
        );
      });
    }

    if (this.app.BROWSER) {
      this.addNotification(tx);
    }

    return tweet;
  }

  async receiveRetweetTransaction(tx, blk = null) {
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';

    if (!targetSignature) {
      return null;
    }

    await this.saveRetweet(tx, blk);

    const interactionTs = Number(tx.timestamp) || Date.now();
    const retweeterKey =
      tx.from && tx.from[0] && tx.from[0].publicKey ? String(tx.from[0].publicKey) : '';
    const tweet = this.getTweet(targetSignature);

    if (tweet?.tx) {
      const targetTx = tweet.tx;

      if (!targetTx.optional || typeof targetTx.optional !== 'object') {
        targetTx.optional = {};
      }

      const targetTs =
        Number(tweet.updated_at) ||
        Number(targetTx.optional.updated_at) ||
        Number(targetTx.timestamp) ||
        0;

      if (interactionTs > targetTs) {
        targetTx.optional.num_retweets = Number(targetTx.optional.num_retweets) || 0;
        targetTx.optional.num_retweets += 1;

        if (!Array.isArray(targetTx.optional.retweeters)) {
          targetTx.optional.retweeters = [];
        }

        if (retweeterKey && !targetTx.optional.retweeters.includes(retweeterKey)) {
          targetTx.optional.retweeters.unshift(retweeterKey);
        }

        targetTx.optional.retweeted_at = interactionTs;
        targetTx.optional.updated_at = interactionTs;
        tweet.retweets = targetTx.optional.num_retweets;
        tweet.retweeters = targetTx.optional.retweeters.slice();
        tweet.updated_at = interactionTs;

        await this.app.storage.updateTransaction(
          targetTx,
          { updated_at: interactionTs },
          'localhost'
        );

        tweet.refreshControls();
      }
    } else {
      await new Promise((resolve) => {
        this.app.storage.loadTransactions(
          { sig: targetSignature, field1: 'RedSquare' },
          async (txs) => {
            if (txs?.length > 0) {
              const targetTx = txs[0];

              if (!targetTx.optional || typeof targetTx.optional !== 'object') {
                targetTx.optional = {};
              }

              const targetTs =
                Number(targetTx.optional.updated_at) || Number(targetTx.timestamp) || 0;

              if (interactionTs > targetTs) {
                targetTx.optional.num_retweets = Number(targetTx.optional.num_retweets) || 0;
                targetTx.optional.num_retweets += 1;

                if (!Array.isArray(targetTx.optional.retweeters)) {
                  targetTx.optional.retweeters = [];
                }

                if (retweeterKey && !targetTx.optional.retweeters.includes(retweeterKey)) {
                  targetTx.optional.retweeters.unshift(retweeterKey);
                }

                targetTx.optional.retweeted_at = interactionTs;

                await this.app.storage.updateTransaction(
                  targetTx,
                  { updated_at: interactionTs },
                  'localhost'
                );
              }
            }

            resolve();
          },
          'localhost'
        );
      });
    }

    if (this.app.BROWSER) {
      this.addNotification(tx);
    }

    return tweet;
  }

  async receiveFlagTweetTransaction(tx, blk = null) {
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';

    if (!targetSignature) {
      return null;
    }

    const interactionTs = Number(tx.timestamp) || Date.now();
    const tweet = this.getTweet(targetSignature);

    if (tweet?.tx) {
      if (!tweet.tx.optional || typeof tweet.tx.optional !== 'object') {
        tweet.tx.optional = {};
      }

      tweet.tx.optional.flagged = 1;
      tweet.flagged = 1;

      await this.app.storage.updateTransaction(
        tweet.tx,
        { updated_at: interactionTs, flagged: 1 },
        'localhost'
      );

      tweet.refresh();
      return tweet;
    }

    await new Promise((resolve) => {
      this.app.storage.loadTransactions(
        { sig: targetSignature, field1: 'RedSquare' },
        async (txs) => {
          if (txs?.length > 0) {
            const archivedTx = txs[0];

            if (!archivedTx.optional || typeof archivedTx.optional !== 'object') {
              archivedTx.optional = {};
            }

            archivedTx.optional.flagged = 1;

            await this.app.storage.updateTransaction(
              archivedTx,
              { updated_at: interactionTs, flagged: 1 },
              'localhost'
            );
          }

          resolve();
        },
        'localhost'
      );
    });

    return null;
  }

  async receiveReviewTweetTransaction(tx, blk = null) {
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';
    const decision = txmsg?.data?.decision != null ? String(txmsg.data.decision) : '';

    if (!targetSignature || (decision !== 'approve' && decision !== 'delete')) {
      return null;
    }

    const interactionTs = Number(tx.timestamp) || Date.now();
    const tweet = this.getTweet(targetSignature);

    const resolveTargetTx = async () => {
      if (tweet?.tx) {
        return tweet.tx;
      }

      return await new Promise((resolve) => {
        this.app.storage.loadTransactions(
          { sig: targetSignature, field1: 'RedSquare' },
          (txs) => {
            resolve(txs?.length ? txs[0] : null);
          },
          'localhost'
        );
      });
    };

    const targetTx = await resolveTargetTx();

    if (!targetTx) {
      if (this.app.BROWSER && this.moderator_mode) {
        this.moderate?.removeTweet?.(targetSignature);
      }
      return null;
    }

    if (decision === 'delete') {
      await this.app.storage.deleteTransaction(targetTx, null, 'localhost');
      this.removeTweet(targetSignature);

      if (this.app.BROWSER && this.moderator_mode) {
        this.moderate?.removeTweet?.(targetSignature);
      }

      return null;
    }

    // approve → flagged = 2 (reviewed), curated = 1
    if (!targetTx.optional || typeof targetTx.optional !== 'object') {
      targetTx.optional = {};
    }

    targetTx.optional.curated = 1;
    targetTx.optional.flagged = 2;

    await this.app.storage.updateTransaction(
      targetTx,
      { updated_at: interactionTs, flagged: 2 },
      'localhost'
    );

    if (tweet) {
      tweet.curated = 1;
      tweet.flagged = 2;
    }

    if (this.app.BROWSER && this.moderator_mode) {
      this.moderate?.removeTweet?.(targetSignature);
    }

    return tweet || null;
  }

  async onConfirmation(blk, tx, conf) {
    if (Number(conf) !== 0) {
      return;
    }

    const txmsg = tx.returnMessage();

    if (txmsg.module && txmsg.module !== this.name) {
      return;
    }

    switch (txmsg.request) {
      case 'create tweet': {
        const signature = tx.signature != null ? String(tx.signature) : '';
        const hadTweet = this.hasTweet(signature);
        const tweet = await this.receiveTweetTransaction(tx, blk);

        if (this.app.BROWSER && tweet && !hadTweet) {
          this.manager?.onNewerContentLoaded?.(
            {
              type: 'tweets',
              direction: 'newer',
              added: [signature],
              new_tweets: [signature],
              updated: [],
              ignored: [],
              exhausted: false
            },
            { announce: true }
          );
        }
        break;
      }
      case 'like tweet':
        await this.receiveLikeTweetTransaction(tx, blk);
        break;
      case 'retweet':
        await this.receiveRetweetTransaction(tx, blk);
        break;
      case 'flag tweet':
        await this.receiveFlagTweetTransaction(tx, blk);
        break;
      case 'review tweet':
        await this.receiveReviewTweetTransaction(tx, blk);
        break;
      default:
        break;
    }
  }

  respondTo(type = '', obj) {
    if (type === 'user-menu') {
      const publicKey = obj?.publicKey || '';

      if (!publicKey) {
        return null;
      }

      return {
        text: publicKey === this.publicKey ? 'My RedSquare Profile' : 'View RedSquare Profile',
        icon: 'fa-solid fa-square',
        callback: () => {
          if (this.browser_active && this.manager) {
            this.manager.renderPosts(publicKey);
            return;
          }

          navigateWindow(`/${encodeURI(this.returnSlug())}/user/${encodeURIComponent(publicKey)}`);
        }
      };
    }

    if (type === 'saito-header') {
      if (this.browser_active) {
        return [];
      }

      return [
        {
          text: 'RedSquare',
          icon: 'fa-solid fa-square',
          rank: 20,
          type: 'navigation',
          navigation: '/redsquare',
          callback: () => {
            navigateWindow('/redsquare');
          },
          event: (id) => {
            this.app.connection.on('redsquare-update-notifications', (unread) => {
              this.app.browser.addNotificationToId(unread, id);
              this.app.connection.emit('saito-header-notification', 'redsquare', unread);
            });
          }
        }
      ];
    }

    if (type === 'saito-floating-menu') {
      return [
        {
          text: 'Tweet',
          icon: 'fa-solid fa-pen',
          is_active: this.browser_active,
          disallowed_mods: ['arcade'],
          rank: 10,
          callback: (app) => {
            this.compose_overlay?.open();
          }
        },
        {
          text: 'Tweet Image',
          icon: 'fas fa-image',
          is_active: this.browser_active,
          disallowed_mods: ['arcade'],
          rank: 20,
          callback: (app) => {
            this.compose_overlay?.open();
            setTimeout(() => {
              document.querySelector('.saito-overlay .compose .file-input')?.click();
            }, 100);
          }
        }
      ];
    }

    return null;
  }

  //
  // Tweet API — delegated to lib/tweets.js
  //

  addTweet(tx) {
    return Tweets.addTweet(this, tx);
  }

  removeTweet(signature) {
    return Tweets.removeTweet(this, signature);
  }

  updateTweet(tx) {
    return Tweets.updateTweet(this, tx);
  }

  getTweet(signature) {
    return Tweets.getTweet(this, signature) || this.profile_tweets[String(signature || '')] || null;
  }

  showTweetInfo(tweet) {
    return Tweets.showTweetInfo(this, tweet);
  }

  hasTweet(signature) {
    return Tweets.hasTweet(this, signature);
  }

  isValidTweetMessage(tweet) {
    return Tweets.isValidTweetMessage(this, tweet);
  }

  indexTweetRelationships(signature) {
    return Tweets.indexTweetRelationships(this, signature);
  }

  unindexTweetRelationships(signature) {
    return Tweets.unindexTweetRelationships(this, signature);
  }

  addChildSignature(parentSignature, childSignature) {
    return Tweets.addChildSignature(this, parentSignature, childSignature);
  }

  removeChildSignature(parentSignature, childSignature) {
    return Tweets.removeChildSignature(this, parentSignature, childSignature);
  }

  updateCriticalChild(parentSignature) {
    return Tweets.updateCriticalChild(this, parentSignature);
  }

  attachOrphans(parentSignature) {
    return Tweets.attachOrphans(this, parentSignature);
  }

  insertTimeline(signature) {
    return Tweets.insertTimeline(this, signature);
  }

  removeFromTimeline(signature) {
    return Tweets.removeFromTimeline(this, signature);
  }

  resortTimeline() {
    return Tweets.resortTimeline(this);
  }

  //
  // Notification API — delegated to lib/notifications.js
  //

  normalizeNotificationInput(input) {
    return Notifications.normalizeNotificationInput(this, input);
  }

  getNotificationAggregateKey(notification) {
    return Notifications.getNotificationAggregateKey(this, notification);
  }

  getUnreadNotificationCount() {
    return Notifications.getUnreadNotificationCount(this);
  }

  incrementUnreadNotifications(notification) {
    return Notifications.incrementUnreadNotifications(this, notification);
  }

  markNotificationsViewed() {
    return Notifications.markNotificationsViewed(this);
  }

  updateNotificationBadge() {
    return Notifications.updateNotificationBadge(this);
  }

  ensureNotificationTweet(notification) {
    return Notifications.ensureNotificationTweet(this, notification);
  }

  aggregateLikeNotification(existing, incoming) {
    return Notifications.aggregateLikeNotification(this, existing, incoming);
  }

  addNotification(input) {
    return Notifications.addNotification(this, input);
  }

  removeNotification(signature) {
    return Notifications.removeNotification(this, signature);
  }

  updateNotification(input) {
    return Notifications.updateNotification(this, input);
  }

  getNotification(signature) {
    return Notifications.getNotification(this, signature);
  }

  hasNotification(signature) {
    return Notifications.hasNotification(this, signature);
  }

  insertNotificationTimeline(signature) {
    return Notifications.insertNotificationTimeline(this, signature);
  }

  removeFromNotificationTimeline(signature) {
    return Notifications.removeFromNotificationTimeline(this, signature);
  }

  resortNotificationTimeline() {
    return Notifications.resortNotificationTimeline(this);
  }

  async ensureRendered() {
    if (!this.browser_active) {
      return;
    }

    if (this.main == null) {
      await this.render();
    }

    if (this.main?.manager) {
      this.main.manager.render();
    }
  }

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (this.main == null) {
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.main = new Main(this.app, this);
      this.addComponent(this.header);
      this.addComponent(this.main);

      // Chat remains optional and owns its UI; RedSquare only supplies containers.
      const cm = this.app.modules.returnFirstRespondTo?.('chat-manager') || null;
      this.main.setChatManager(cm);

      if (this.main.hasChatCapability()) {
        this.addComponent(cm);
      }
    }

    await super.render();

    await this.manager?.applyLocationRoute?.();

    // Ordered mounts: Arcade (My Games) → League (Leaderboard) → other peers.
    if (this.app.modules?.renderInto) {
      await this.app.modules.renderInto('.redsquare-arcade');
      await this.app.modules.renderInto('.redsquare-leaderboard');
      await this.app.modules.renderInto('.redsquare-sidebar');
    }

    this.renderFirstVisitSplash();
  }

  renderFirstVisitSplash() {
    if (
      !this.app.BROWSER ||
      !this.show_splash ||
      document.querySelector('.redsquare-splash-overlay')
    ) {
      return;
    }

    document.body.insertAdjacentHTML('beforeend', SplashTemplate());

    // Persist dismissal only when the user completes onboarding — not when the
    // splash is merely shown. Otherwise a reload mid-splash permanently skips it.
    document.querySelector('.redsquare-splash-join')?.addEventListener('click', () => {
      document.querySelector('.redsquare-splash-overlay')?.remove();
      this.show_splash = false;
      this.saveOptions();
    });
  }

  returnTweetUrl(signature) {
    if (typeof window === 'undefined') {
      return '';
    }

    return `${window.location.origin}/${encodeURI(this.returnSlug())}/tweet/${encodeURIComponent(
      signature
    )}`;
  }

  returnUserUrl(publicKey) {
    const path = `/${encodeURI(this.returnSlug())}/user/${encodeURIComponent(publicKey || '')}`;

    if (typeof window === 'undefined') {
      return path;
    }

    return `${window.location.origin}${path}`;
  }

  returnUserPublicKeyFromLocation(location = null) {
    const currentLocation = location || (typeof window !== 'undefined' ? window.location : null);

    if (!currentLocation) {
      return '';
    }

    const prefix = `/${encodeURI(this.returnSlug())}/user/`;
    const pathname = currentLocation.pathname || '';

    if (pathname.startsWith(prefix)) {
      const encodedPublicKey = pathname.slice(prefix.length).split('/')[0];

      try {
        return decodeURIComponent(encodedPublicKey);
      } catch (err) {
        return '';
      }
    }

    const params = new URLSearchParams(currentLocation.search || '');
    const legacyPublicKey = params.get('user_id') || '';

    if (legacyPublicKey) {
      return legacyPublicKey;
    }

    return currentLocation.hash === '#profile' ? this.publicKey || '' : '';
  }

  async cacheProfileTweetTransactions(txs = []) {
    const cached = [];

    for (const tx of txs) {
      if (!tx) {
        continue;
      }

      if (typeof tx.decryptMessage === 'function') {
        await tx.decryptMessage(this.app);
      }

      const message = tx.returnMessage?.() || tx.msg || {};
      const signature = tx.signature != null ? String(tx.signature) : '';

      if (
        !signature ||
        (message.module && message.module !== this.name) ||
        message.request !== 'create tweet' ||
        this.app.modules?.moderate?.(tx, this.name) === -1
      ) {
        continue;
      }

      let tweet = Tweets.getTweet(this, signature) || this.profile_tweets[signature];

      if (tweet) {
        tweet.updateFromTransaction(tx);
      } else {
        tweet = new Tweet(this.app, this, tx);
        this.profile_tweets[signature] = tweet;
      }

      cached.push(tweet);
    }

    return cached;
  }

  returnTweetSignatureFromLocation(location = null) {
    const currentLocation = location || (typeof window !== 'undefined' ? window.location : null);

    if (!currentLocation) {
      return '';
    }

    const prefix = `/${encodeURI(this.returnSlug())}/tweet/`;
    const pathname = currentLocation.pathname || '';

    if (pathname.startsWith(prefix)) {
      const encodedSignature = pathname.slice(prefix.length).split('/')[0];

      try {
        return decodeURIComponent(encodedSignature);
      } catch (err) {
        return '';
      }
    }

    const params = new URLSearchParams(currentLocation.search || '');
    return params.get('tweet_id') || params.get('thread_id') || '';
  }

  loadArchiveTransactions(query, archivePeer = 'localhost', timeoutMs = 5000) {
    return new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = (txs = []) => {
        if (settled) {
          return;
        }

        settled = true;
        if (timer) {
          clearTimeout(timer);
        }
        resolve(Array.isArray(txs) ? txs : []);
      };
      timer = setTimeout(() => finish(), timeoutMs);

      try {
        Promise.resolve(
          this.app.storage.loadTransactions(query, (txs) => finish(txs), archivePeer)
        ).catch(() => finish());
      } catch (err) {
        finish();
      }
    });
  }

  async addLoadedTweetTransactions(txs = []) {
    for (const tx of txs) {
      if (!tx) {
        continue;
      }

      if (typeof tx.decryptMessage === 'function') {
        await tx.decryptMessage(this.app);
      }

      this.addTweet(tx);
    }
  }

  returnTweetArchivePeers() {
    const archivePeers = ['localhost'];
    const publicKeys = new Set();

    for (const peerObject of this.peers || []) {
      const archivePeer = peerObject?.peer;

      if (!archivePeer || archivePeer === 'localhost') {
        continue;
      }

      const publicKey = archivePeer.publicKey || peerObject.publicKey || '';

      if (publicKey && !publicKeys.has(publicKey)) {
        publicKeys.add(publicKey);
        archivePeers.push(archivePeer);
      }
    }

    return archivePeers;
  }

  async loadTweetThread(signature) {
    const targetSignature = String(signature || '');

    if (!targetSignature) {
      return null;
    }

    const archivePeers = this.returnTweetArchivePeers();

    if (!this.hasTweet(targetSignature)) {
      const targetResults = await Promise.all(
        archivePeers.map((peer) =>
          this.loadArchiveTransactions(
            { sig: targetSignature, field1: 'RedSquare', flagged_ne: 1 },
            peer
          )
        )
      );

      for (const txs of targetResults) {
        await this.addLoadedTweetTransactions(txs);
      }
    }

    const target = this.getTweet(targetSignature);

    if (!target) {
      return null;
    }

    const threadId = target.thread_id || target.signature;
    const threadResults = await Promise.all(
      archivePeers.map((peer) =>
        this.loadArchiveTransactions(
          { field1: 'RedSquare', field5: threadId, flagged_ne: 1, limit: 100 },
          peer
        )
      )
    );

    for (const txs of threadResults) {
      await this.addLoadedTweetTransactions(txs);
    }

    return this.getTweet(targetSignature);
  }

  async returnTweetSocial(signature, req) {
    if (!signature) {
      return null;
    }

    const txs = await this.loadArchiveTransactions(
      { sig: String(signature || ''), field1: 'RedSquare', flagged_ne: 1 },
      'localhost'
    );
    const tx = txs[0];

    if (!tx) {
      return null;
    }

    if (typeof tx.decryptMessage === 'function') {
      await tx.decryptMessage(this.app);
    }

    const message = tx.returnMessage?.() || tx.msg || {};
    const publicKey = tx.from?.[0]?.publicKey || '';
    const username =
      this.app.keychain.returnUsername(publicKey) ||
      (publicKey ? `Anon-${publicKey.slice(0, 6)}` : 'Anonymous');
    const origin = `${req.protocol}://${req.get('host')}`;
    const encodedSignature = encodeURIComponent(signature);
    const basePath = `/${encodeURI(this.returnSlug())}`;

    return {
      twitter: '@SaitoOfficial',
      title: `${username} posted on Saito 🟥`,
      url: `${origin}${basePath}/tweet/${encodedSignature}`,
      description: String(message.data?.text || ''),
      image: `${origin}${basePath}/og-image/${encodedSignature}`
    };
  }

  async returnShortLinkSocial(row, req) {
    const origin = `${req.protocol}://${req.get('host')}`;
    const target = new URL(row?.link || '', origin);
    const basePath = `/${encodeURI(this.returnSlug())}`;
    const prefix = `${basePath}/tweet/`;

    if (target.host !== req.get('host')) {
      return null;
    }

    let signature = '';

    try {
      if (target.pathname.startsWith(prefix)) {
        const encodedSignature = target.pathname.slice(prefix.length).split('/')[0];
        signature = decodeURIComponent(encodedSignature);
      } else if (target.pathname === basePath || target.pathname === `${basePath}/`) {
        signature =
          target.searchParams.get('tweet_id') || target.searchParams.get('thread_id') || '';
      }

      return signature ? await this.returnTweetSocial(signature, req) : null;
    } catch (err) {
      return null;
    }
  }

  dataUriToImage(dataUri) {
    const match =
      /^data:(image\/(?:png|jpe?g|gif|webp|svg\+xml|png\+xml));base64,([a-z\d+/=]+)$/i.exec(
        String(dataUri || '')
      );

    if (!match) {
      return null;
    }

    const mimeType = match[1].toLowerCase() === 'image/png+xml' ? 'image/png' : match[1];

    return {
      mimeType,
      buffer: Buffer.from(match[2], 'base64')
    };
  }

  async returnTweetImage(signature) {
    if (!signature) {
      return null;
    }

    const txs = await this.loadArchiveTransactions(
      { sig: String(signature || ''), field1: 'RedSquare', flagged_ne: 1 },
      'localhost'
    );
    const tx = txs[0];

    if (!tx) {
      return null;
    }

    if (typeof tx.decryptMessage === 'function') {
      await tx.decryptMessage(this.app);
    }

    const message = tx.returnMessage?.() || tx.msg || {};
    const tweetImage = this.dataUriToImage(message.data?.images?.[0]);

    if (tweetImage) {
      return tweetImage;
    }

    const publicKey = tx.from?.[0]?.publicKey || '';
    return this.dataUriToImage(this.app.keychain.returnIdenticon(publicKey, 'png'));
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const webdir = `${__dirname}/web`;
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    const routeBase = uri.endsWith('/') ? uri.slice(0, -1) : uri;
    const self = this;

    expressapp.use(uri, express.static(webdir));

    expressapp.get(`${routeBase}/tweet/:signature`, async function (req, res) {
      let social = self.social;

      try {
        social = (await self.returnTweetSocial(req.params.signature, req)) || self.social;
      } catch (err) {
        console.error('RedSquare tweet metadata lookup failed:', err);
      }

      const html = index(app, self, app.build_number, social);

      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });

    expressapp.get(`${routeBase}/user/:publicKey`, function (req, res) {
      const html = index(app, self, app.build_number);

      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });

    expressapp.get(`${routeBase}/og-image/:signature`, async function (req, res) {
      let image = null;

      try {
        image = await self.returnTweetImage(req.params.signature);
      } catch (err) {
        console.error('RedSquare tweet image lookup failed:', err);
      }

      if (!image) {
        return res.redirect(302, self.social.image);
      }

      res.writeHead(200, {
        'Content-Type': image.mimeType,
        'Content-Length': image.buffer.length
      });
      return res.end(image.buffer);
    });

    expressapp.get(uri, function (req, res) {
      const imageSignature = req.query?.og_img_sig;
      const tweetSignature = req.query?.tweet_id || req.query?.thread_id;
      const userPublicKey = req.query?.user_id;

      if (imageSignature) {
        return res.redirect(
          301,
          `${routeBase}/og-image/${encodeURIComponent(String(imageSignature))}`
        );
      }

      if (tweetSignature) {
        return res.redirect(
          301,
          `${routeBase}/tweet/${encodeURIComponent(String(tweetSignature))}`
        );
      }

      if (userPublicKey) {
        return res.redirect(
          301,
          `${routeBase}/user/${encodeURIComponent(String(userPublicKey))}`
        );
      }

      const html = index(app, self, app.build_number);
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });
  }

  //
  // Development-only fixtures for exercising the UI. Not part of production loading.
  //
  returnMockTransactions() {
    const authors = [
      'redsquare-mock-pk-saito',
      'redsquare-mock-pk-alice',
      'redsquare-mock-pk-bob',
      'redsquare-mock-pk-carol'
    ];
    const now = Date.now();
    const mockSig = (seed) => `${seed.toString(16).padStart(64, '0')}`;

    const build = ({
      seed,
      author = 0,
      text,
      parent_id = '',
      thread_id = '',
      images = [],
      embedded = null,
      minutesAgo = 0,
      optional = {}
    }) => {
      const signature = mockSig(seed);
      const publicKey = authors[author % authors.length];
      const timestamp = now - minutesAgo * 60 * 1000;
      const data = {
        text,
        images,
        parent_id,
        thread_id: thread_id || (parent_id ? '' : signature)
      };

      if (embedded) {
        data.embedded = embedded;
      }

      if (parent_id && thread_id) {
        data.thread_id = thread_id;
      }

      return {
        signature,
        timestamp,
        from: [
          {
            publicKey,
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: this.name,
          request: 'create tweet',
          data
        },
        optional: {
          num_likes: 12,
          num_replies: 3,
          num_retweets: 5,
          ...optional
        }
      };
    };

    const normalSig = mockSig(1);
    const threadRootSig = mockSig(2);
    const threadReplySig = mockSig(3);
    const embeddedSig = mockSig(8);

    return [
      build({
        seed: 1,
        author: 0,
        minutesAgo: 60,
        text: 'Welcome to RedSquare — a normal timeline post for UI development.'
      }),
      build({
        seed: 5,
        author: 1,
        minutesAgo: 55,
        parent_id: normalSig,
        thread_id: normalSig,
        text: 'This is a reply to the post above.',
        optional: { num_likes: 4, num_replies: 0, num_retweets: 1 }
      }),
      build({
        seed: 2,
        author: 2,
        minutesAgo: 45,
        text: 'Thread root — open this post to walk the critical reply chain.'
      }),
      build({
        seed: 3,
        author: 3,
        minutesAgo: 40,
        parent_id: threadRootSig,
        thread_id: threadRootSig,
        text: 'First reply in the thread.',
        optional: { num_likes: 6, num_replies: 1, num_retweets: 0 }
      }),
      build({
        seed: 4,
        author: 1,
        minutesAgo: 35,
        parent_id: threadReplySig,
        thread_id: threadRootSig,
        text: 'Second reply — continues the critical path.',
        optional: { num_likes: 2, num_replies: 0, num_retweets: 0 }
      }),
      build({
        seed: 6,
        author: 0,
        minutesAgo: 25,
        text: 'Quote-posting another tweet below.',
        embedded: {
          signature: embeddedSig,
          publicKey: authors[2],
          text: 'Embedded tweet card — quoted content rendered inline.',
          created_at: now - 30 * 60 * 1000,
          images: [],
          likes: 9,
          replies: 2,
          retweets: 1
        }
      }),
      build({
        seed: 7,
        author: 3,
        minutesAgo: 10,
        text: 'Image gallery fixture with four placeholders.',
        images: [
          '/saito/img/dreamscape.png',
          '/saito/img/dreamscape.png',
          '/saito/img/dreamscape.png',
          '/saito/img/dreamscape.png'
        ],
        optional: { num_likes: 28, num_replies: 6, num_retweets: 11 }
      })
    ];
  }
}

module.exports = RedSquare;
