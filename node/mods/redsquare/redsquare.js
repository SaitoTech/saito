const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Transaction = require('../../lib/saito/transaction').default;
const Main = require('./lib/main');
const Manager = require('./lib/manager');
const Tweets = require('./lib/tweets');
const Notifications = require('./lib/notifications');
const ComposeOverlay = require('./lib/ui/overlays/compose');
const TweetMenu = require('./lib/ui/overlays/tweet-menu');
const SettingsOverlay = require('./lib/ui/overlays/settings');
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
    this.notifications_earliest_tweet_ts = new Date().getTime();
    this.notifications_earliest_like_ts = new Date().getTime();
    this.notifications_latest_ts = 0;

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

    this.curated = true;
    this.show_splash = true;
    this.passive_poll_interval_ms = 5 * 60 * 1000;

    // Enables banner / description editing via Profile-module events.
    this.enable_profile_edits = true;

    this.styles = ['/saito/saito.css', '/redsquare/style.css'];

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
        name: key ? this.app.keychain.returnUsername(key) || `Anon-${key.slice(0, 6)}` : 'Anonymous',
        handle: '',
        bio: '',
        avatar: key
          ? this.app.keychain.returnIdenticon(key) || '/saito/img/dreamscape.png'
          : '/saito/img/dreamscape.png',
        banner: '',
        can_edit: Boolean(this.enable_profile_edits && key)
      };

      this.loadOptions();

      for (const tx of this.returnMockTransactions()) {
        this.addTweet(tx);
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
    this.startPassivePolling();
    this.manager?.onPeersUpdated?.();
  }

  startPassivePolling() {
    if (!this.app.BROWSER || this._passive_poll_timer) {
      return;
    }

    const interval = this.passive_poll_interval_ms || 5 * 60 * 1000;

    this._passive_poll_timer = setInterval(() => {
      if (!this.browser_active || this.peers.length === 0) {
        return;
      }

      this.loadTransactions('tweets', 'newer', (result) => {
        if (result?.added?.length) {
          this.manager?.onNewerContentLoaded?.(result);
        }
      });
    }, interval);
  }

  stopPassivePolling() {
    if (!this._passive_poll_timer) {
      return;
    }

    clearInterval(this._passive_poll_timer);
    this._passive_poll_timer = null;
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
      const updated = [];
      const ignored = [];
      const peer_exhausted = [];
      let peers_remaining = 0;

      const finishTweets = () => {
        const exhausted =
          added.length === 0 && peer_exhausted.length > 0 && peer_exhausted.every(Boolean);
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
          } else if (!updated.includes(signature)) {
            updated.push(signature);
          }

          if (older && created_at < peer_obj.tweets_earliest_ts) {
            peer_obj.tweets_earliest_ts = created_at;
            this.tweets_earliest_ts = Math.min(this.tweets_earliest_ts, peer_obj.tweets_earliest_ts);
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
          (!isOlder &&
            (peer_obj.publicKey !== this.publicKey || peer_obj.peer === 'localhost'));

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
            flagged: 0,
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
    let exhausted = false;
    let queries = 0;
    let queries_done = 0;

    const finishNotifications = () => {
      if (collected.length === 0) {
        if (isOlder) {
          this.notifications_earliest_tweet_ts = 0;
          this.notifications_earliest_like_ts = 0;
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
          } else if (ts < this.notifications_earliest_tweet_ts) {
            this.notifications_earliest_tweet_ts = ts;
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
      if (this.notifications_earliest_tweet_ts) {
        queries++;

        this.app.storage.loadTransactions(
          {
            field1: 'RedSquare',
            field3: this.publicKey,
            created_earlier_than: this.notifications_earliest_tweet_ts,
            limit: 10
          },
          (txs) => {
            for (const tx of txs || []) {
              if (tx.timestamp < this.notifications_earliest_tweet_ts) {
                this.notifications_earliest_tweet_ts = tx.timestamp;
              }
              collected.push(tx);
            }
            onNotificationQueryDone();
          },
          'localhost'
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
    } else {
      queries++;

      this.app.storage.loadTransactions(
        {
          field1: 'RedSquare',
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
    if (tx == null || !mycallback) {
      return 0;
    }

    const txmsg = tx.returnMessage();

    if (!txmsg.request) {
      return 0;
    }

    if (txmsg.request === 'load tweets' && txmsg.data?.created_earlier_than != undefined) {
      const obj = {
        field1: 'RedSquare',
        flagged: 0,
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
      payload.mentions = Array.isArray(payload.mentions) ? payload.mentions.slice() : [payload.mentions];
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

  async receiveTweetTransaction(tx) {
    const tweet = this.addTweet(tx);

    if (this.app.BROWSER && Notifications.isAddressedToUser(this, tx)) {
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

  async receiveLikeTweetTransaction(tx) {
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';

    if (!targetSignature) {
      return null;
    }

    const interactionTs = Number(tx.timestamp) || Date.now();
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
        targetTx.optional.num_likes = Number(targetTx.optional.num_likes) || 0;
        targetTx.optional.num_likes += 1;
        targetTx.optional.updated_at = interactionTs;
        tweet.likes = targetTx.optional.num_likes;
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
                targetTx.optional.num_likes = Number(targetTx.optional.num_likes) || 0;
                targetTx.optional.num_likes += 1;

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

  async receiveRetweetTransaction(tx) {
    const txmsg = tx?.returnMessage?.() || tx?.msg || {};
    const targetSignature = txmsg?.data?.signature != null ? String(txmsg.data.signature) : '';

    if (!targetSignature) {
      return null;
    }

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

  async onConfirmation(blk, tx, conf) {
    if (conf !== 0) {
      return;
    }

    const txmsg = tx.returnMessage();

    if (txmsg.module && txmsg.module !== this.name) {
      return;
    }

    switch (txmsg.request) {
      case 'create tweet':
        await this.receiveTweetTransaction(tx);
        break;
      case 'like tweet':
        await this.receiveLikeTweetTransaction(tx);
        break;
      case 'retweet':
        await this.receiveRetweetTransaction(tx);
        break;
      default:
        break;
    }
  }

  respondTo(type = '', obj) {
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
    return Tweets.getTweet(this, signature);
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

      // Chat Manager owns chat — RedSquare only provides `.sidebar-left`.
      for (const mod of this.app.modules.returnModulesRespondingTo('chat-manager')) {
        const cm = mod.respondTo('chat-manager');
        cm.container = '.sidebar-left';
        cm.render_manager_to_screen = 1;
        this.addComponent(cm);
      }
    }

    await super.render();

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

    this.show_splash = false;
    this.saveOptions();

    document.querySelector('.redsquare-splash-join')?.addEventListener('click', () => {
      document.querySelector('.redsquare-splash-overlay')?.remove();
    });
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    let webdir = `${__dirname}/web`;
    let uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    let self = this;

    expressapp.use(uri, express.static(webdir));

    expressapp.get(uri, function (req, res) {
      let html = index(app, self, app.build_number);
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
