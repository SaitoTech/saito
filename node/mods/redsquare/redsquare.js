const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Main = require('./lib/main');
const Tweet = require('./lib/tweet');
const Notification = require('./lib/notification');
const Manager = require('./lib/manager');
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

    //
    // notifications data structures
    //
    this.notifications = {};
    this.notifications_timeline = [];
    this.notifications_aggregate = {};
    this.notifications_unread_count = 0;
    this.notifications_last_viewed_ts = 0;

    this.manager = null;
    this.timeline_ready = false;
    this.peers = [];
    this.profile = null;
    this.mockAuthors = {
      'redsquare-mock-pk-saito': {
        name: 'Saito Network',
        handle: 'saito',
        avatar: '/saito/img/dreamscape.png'
      },
      'redsquare-mock-pk-rp': {
        name: 'Richard P.',
        handle: 'rp',
        avatar: '/saito/img/tiled-logo.svg'
      },
      'redsquare-mock-pk-alice': {
        name: 'Alice Chen',
        handle: 'alice',
        avatar: '/saito/img/dreamscape.png'
      },
      'redsquare-mock-pk-bob': {
        name: 'Bob Martinez',
        handle: 'bob',
        avatar: '/saito/img/tiled-logo.svg'
      },
      'redsquare-mock-pk-carol': {
        name: 'Carol Okonkwo',
        handle: 'carol',
        avatar: '/saito/img/dreamscape.png'
      },
      'redsquare-mock-pk-dave': {
        name: 'Dave Kim',
        handle: 'dave',
        avatar: '/saito/img/tiled-logo.svg'
      }
    };

    this.header = null;
    this.main = null;
    this.compose = null;

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

    if (app.BROWSER) {
      this.manager = new Manager(app, this);
      const ComposeOverlay = require('./lib/ui/overlays/compose');
      this.compose = new ComposeOverlay(app, this);

      this.app.connection.on('redsquare-new-post', () => {
        this.compose?.open();
      });

      this.app.connection.on('redsquare-post-tweet', async (data, keys = []) => {
        const tx = await this.createTweetTransaction(data, keys);
        await tx.sign();
        await this.app.network.propagateTransaction(tx);
      });

      this.profile = {
        name: 'Your Name',
        handle: 'you',
        bio: 'Building on Saito. Open source enthusiast.',
        avatar: '/saito/img/dreamscape.png',
        followers: 1284,
        following: 412,
        posts: 847
      };
    }
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

    if (!this.timeline_ready) {
      await this.loadCachedTransactions();
      this.timeline_ready = true;
    }

    await this.ensureRendered();
  }

  registerPeer(peer) {
    const publicKey = peer?.publicKey || '';

    if (!publicKey) {
      return;
    }

    if (!this.peers.find((p) => p.publicKey === publicKey)) {
      this.peers.push({ peer, publicKey });
    }
  }

  async loadCachedTransactions() {
    const txs = await this.fetchCachedTransactions();

    for (const tx of txs) {
      this.addTweet(tx);
    }

    const notificationTxs = await this.fetchCachedNotifications();

    for (const tx of notificationTxs) {
      this.addNotification(tx);
    }
  }

  async fetchCachedTransactions() {
    if (typeof window !== 'undefined' && window.tweets?.length) {
      const Transaction = require('../../lib/saito/transaction').default;
      const txs = [];

      for (const serialized of window.tweets) {
        const tx = new Transaction();
        tx.deserialize_from_web(this.app, serialized);
        txs.push(tx);
      }

      return txs;
    }

    //
    // Development fallback until archive synchronization is wired.
    //
    return this.getMockTransactions();
  }

  async fetchCachedNotifications() {
    return this.getMockNotificationTransactions();
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

  respondTo(type = '', obj) {
    if (type === 'saito-floating-menu') {
      return [
        {
          text: 'Tweet',
          icon: 'fa-solid fa-pen',
          is_active: this.browser_active,
          disallowed_mods: ['arcade'],
          rank: 10,
          callback: (app) => {
            this.compose?.open();
          }
        },
        {
          text: 'Tweet Image',
          icon: 'fas fa-image',
          is_active: this.browser_active,
          disallowed_mods: ['arcade'],
          rank: 20,
          callback: (app) => {
            this.compose?.open();
            setTimeout(() => {
              document.querySelector('.saito-overlay .compose-file-input')?.click();
            }, 100);
          }
        }
      ];
    }

    return null;
  }

  //
  // Tweet API
  //

  addTweet(tx) {
    const tweet = new Tweet(this.app, this, tx);

    if (!tweet.signature) {
      return null;
    }

    if (!this.isValidTweetMessage(tweet)) {
      return null;
    }

    if (this.hasTweet(tweet.signature)) {
      return this.updateTweet(tx);
    }

    this.tweets[tweet.signature] = tweet;
    this.indexTweetRelationships(tweet.signature);
    this.insertTimeline(tweet.signature);
    this.attachOrphans(tweet.signature);

    return tweet;
  }

  removeTweet(signature) {
    if (!signature || !this.hasTweet(signature)) {
      return false;
    }

    this.unindexTweetRelationships(signature);
    this.removeFromTimeline(signature);
    delete this.tweets[signature];

    return true;
  }

  updateTweet(tx) {
    const tweet = new Tweet(this.app, this, tx);

    if (!tweet.signature) {
      return null;
    }

    if (!this.isValidTweetMessage(tweet)) {
      return null;
    }

    const existing = this.getTweet(tweet.signature);

    if (!existing) {
      return this.addTweet(tx);
    }

    const previousParent = existing.parent_id || '';

    existing.updateFromTransaction(tx);

    if ((existing.parent_id || '') !== previousParent) {
      this.unindexTweetRelationships(tweet.signature);
      this.indexTweetRelationships(tweet.signature);
      this.removeFromTimeline(tweet.signature);
      this.insertTimeline(tweet.signature);
    } else {
      this.resortTimeline();
    }

    return existing;
  }

  getTweet(signature) {
    if (!signature) {
      return null;
    }

    return this.tweets[signature] || null;
  }

  hasTweet(signature) {
    return Boolean(signature && this.tweets[signature]);
  }

  isValidTweetMessage(tweet) {
    const txmsg = tweet.returnTxMessage();

    if (txmsg.module && txmsg.module !== this.name) {
      return false;
    }

    if (txmsg.request && txmsg.request !== 'create tweet') {
      return false;
    }

    return true;
  }

  indexTweetRelationships(signature) {
    const tweet = this.getTweet(signature);

    if (!tweet || !tweet.parent_id) {
      return;
    }

    const parentId = tweet.parent_id;

    this.tweets_parents[signature] = parentId;

    if (this.hasTweet(parentId)) {
      this.addChildSignature(parentId, signature);
      return;
    }

    if (!this.tweets_orphans[parentId]) {
      this.tweets_orphans[parentId] = [];
    }

    if (!this.tweets_orphans[parentId].includes(signature)) {
      this.tweets_orphans[parentId].push(signature);
    }
  }

  unindexTweetRelationships(signature) {
    const parentId = this.tweets_parents[signature];

    if (parentId) {
      this.removeChildSignature(parentId, signature);
      delete this.tweets_parents[signature];
    }

    if (this.tweets_children[signature]) {
      for (const childSignature of this.tweets_children[signature]) {
        delete this.tweets_parents[childSignature];

        if (!this.tweets_orphans[signature]) {
          this.tweets_orphans[signature] = [];
        }

        if (!this.tweets_orphans[signature].includes(childSignature)) {
          this.tweets_orphans[signature].push(childSignature);
        }
      }

      delete this.tweets_children[signature];
    }

    for (const parentKey of Object.keys(this.tweets_orphans)) {
      this.tweets_orphans[parentKey] = this.tweets_orphans[parentKey].filter((s) => s !== signature);

      if (this.tweets_orphans[parentKey].length === 0) {
        delete this.tweets_orphans[parentKey];
      }
    }
  }

  addChildSignature(parentSignature, childSignature) {
    if (!this.tweets_children[parentSignature]) {
      this.tweets_children[parentSignature] = [];
    }

    if (!this.tweets_children[parentSignature].includes(childSignature)) {
      this.tweets_children[parentSignature].push(childSignature);
    }

    this.updateCriticalChild(parentSignature);
  }

  removeChildSignature(parentSignature, childSignature) {
    const children = this.tweets_children[parentSignature];

    if (!children) {
      return;
    }

    this.tweets_children[parentSignature] = children.filter((s) => s !== childSignature);

    if (this.tweets_children[parentSignature].length === 0) {
      delete this.tweets_children[parentSignature];
    }

    this.updateCriticalChild(parentSignature);
  }

  updateCriticalChild(parentSignature) {
    const parent = this.getTweet(parentSignature);

    if (!parent) {
      return;
    }

    const children = this.tweets_children[parentSignature] || [];

    if (children.length === 0) {
      parent.critical_child = null;
      return;
    }

    let selected = null;
    let selectedAt = -1;

    for (const childSignature of children) {
      const child = this.getTweet(childSignature);

      if (!child) {
        continue;
      }

      if (child.created_at >= selectedAt) {
        selectedAt = child.created_at;
        selected = childSignature;
      }
    }

    parent.critical_child = selected;
  }

  attachOrphans(parentSignature) {
    const orphans = this.tweets_orphans[parentSignature];

    if (!orphans || orphans.length === 0) {
      return;
    }

    for (const childSignature of orphans) {
      this.tweets_parents[childSignature] = parentSignature;
      this.addChildSignature(parentSignature, childSignature);
    }

    delete this.tweets_orphans[parentSignature];
  }

  insertTimeline(signature) {
    const tweet = this.getTweet(signature);

    if (!tweet || tweet.parent_id) {
      return;
    }

    if (!this.tweets_timeline.includes(signature)) {
      this.tweets_timeline.push(signature);
    }

    this.resortTimeline();
  }

  removeFromTimeline(signature) {
    this.tweets_timeline = this.tweets_timeline.filter((s) => s !== signature);
  }

  resortTimeline() {
    this.tweets_timeline.sort((a, b) => {
      const tweetA = this.getTweet(a);
      const tweetB = this.getTweet(b);

      return (tweetB?.created_at || 0) - (tweetA?.created_at || 0);
    });
  }

  //
  // Notification API
  //

  normalizeNotificationInput(input) {
    if (!input) {
      return null;
    }

    if (input.msg && input.signature != null) {
      return Notification.fromTransaction(this.app, this, input);
    }

    return new Notification(this.app, this, input);
  }

  getNotificationAggregateKey(notification) {
    if (!notification || notification.type !== 'like') {
      return '';
    }

    if (!notification.actor_publicKey || !notification.tweet_signature) {
      return '';
    }

    return `like:${notification.actor_publicKey}:${notification.tweet_signature}`;
  }

  getUnreadNotificationCount() {
    return this.notifications_unread_count || 0;
  }

  incrementUnreadNotifications(notification) {
    if (!notification || notification.unread === false) {
      return;
    }

    this.notifications_unread_count += 1;
  }

  markNotificationsViewed() {
    this.notifications_unread_count = 0;
    this.notifications_last_viewed_ts = Date.now();

    for (const signature of this.notifications_timeline) {
      const notification = this.getNotification(signature);

      if (notification) {
        notification.unread = false;
      }
    }

    this.updateNotificationBadge();
  }

  updateNotificationBadge() {
    const count = this.getUnreadNotificationCount();

    this.app.connection?.emit('redsquare-update-notifications', count);

    if (this.main?.menu) {
      this.main.menu.updateBadge(count);
    }
  }

  ensureNotificationTweet(notification) {
    if (!notification?.tx) {
      return;
    }

    const txmsg =
      typeof notification.returnTxMessage === 'function'
        ? notification.returnTxMessage()
        : notification.tx.msg || {};

    if (txmsg.request !== 'create tweet') {
      return;
    }

    if (!this.hasTweet(notification.signature)) {
      this.addTweet(notification.tx);
    }
  }

  aggregateLikeNotification(existing, incoming) {
    existing.count = (existing.count || 1) + 1;
    existing.created_at = Math.max(existing.created_at || 0, incoming.created_at || 0);
    existing.time = existing.formatRelativeTime(existing.created_at);
    existing.refreshActionText();
    this.resortNotificationTimeline();
    return existing;
  }

  addNotification(input) {
    const notification = this.normalizeNotificationInput(input);

    if (!notification || !notification.signature || !notification.tweet_signature) {
      return null;
    }

    this.ensureNotificationTweet(notification);

    if (!this.hasTweet(notification.tweet_signature)) {
      return null;
    }

    const aggregateKey = this.getNotificationAggregateKey(notification);

    if (aggregateKey && this.notifications_aggregate[aggregateKey]) {
      const existing = this.getNotification(this.notifications_aggregate[aggregateKey]);

      if (existing) {
        return this.aggregateLikeNotification(existing, notification);
      }
    }

    if (this.hasNotification(notification.signature)) {
      return this.updateNotification(input);
    }

    this.notifications[notification.signature] = notification;
    this.insertNotificationTimeline(notification.signature);

    if (aggregateKey) {
      this.notifications_aggregate[aggregateKey] = notification.signature;
    }

    this.incrementUnreadNotifications(notification);
    this.updateNotificationBadge();

    return notification;
  }

  removeNotification(signature) {
    if (!signature || !this.hasNotification(signature)) {
      return false;
    }

    const notification = this.getNotification(signature);
    const aggregateKey = this.getNotificationAggregateKey(notification);

    if (aggregateKey && this.notifications_aggregate[aggregateKey] === signature) {
      delete this.notifications_aggregate[aggregateKey];
    }

    if (notification?.unread) {
      this.notifications_unread_count = Math.max(0, this.notifications_unread_count - 1);
      this.updateNotificationBadge();
    }

    this.removeFromNotificationTimeline(signature);
    delete this.notifications[signature];

    return true;
  }

  updateNotification(input) {
    const notification = this.normalizeNotificationInput(input);

    if (!notification || !notification.signature) {
      return null;
    }

    const existing = this.getNotification(notification.signature);

    if (!existing) {
      return this.addNotification(input);
    }

    existing.parseFromData({
      signature: notification.signature,
      tweet_signature: notification.tweet_signature,
      type: notification.type,
      actor_publicKey: notification.actor_publicKey,
      actor_name: notification.actor_name,
      actor_avatar: notification.actor_avatar,
      text: notification.text,
      count: notification.count,
      created_at: notification.created_at,
      time: notification.time,
      unread: existing.unread
    });

    if (notification.tx) {
      existing.tx = notification.tx;
    }

    existing.refreshActionText();
    this.resortNotificationTimeline();

    return existing;
  }

  getNotification(signature) {
    if (!signature) {
      return null;
    }

    return this.notifications[signature] || null;
  }

  hasNotification(signature) {
    return Boolean(signature && this.notifications[signature]);
  }

  insertNotificationTimeline(signature) {
    const notification = this.getNotification(signature);

    if (!notification) {
      return;
    }

    if (!this.notifications_timeline.includes(signature)) {
      this.notifications_timeline.push(signature);
    }

    this.resortNotificationTimeline();
  }

  removeFromNotificationTimeline(signature) {
    this.notifications_timeline = this.notifications_timeline.filter((s) => s !== signature);
  }

  resortNotificationTimeline() {
    this.notifications_timeline.sort((a, b) => {
      const notificationA = this.getNotification(a);
      const notificationB = this.getNotification(b);

      return (notificationB?.created_at || 0) - (notificationA?.created_at || 0);
    });
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
    }

    await super.render();
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    let webdir = `${__dirname}/web`;
    let uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    let self = this;

    expressapp.use(uri, express.static(webdir));

    expressapp.get(uri, async function (req, res) {
      let html = index(app, self, app.build_number);
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });
  }

  getMockTransactions() {
    return [
      {
        signature: 'redsquare-mock-tx-001',
        timestamp: Date.now() - 2 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-saito',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text:
              'Welcome to RedSquare — peer-to-peer social media on the Saito network. No servers. No silos. Just people talking to people.',
            images: [],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-001'
          }
        },
        optional: {
          num_likes: 248,
          num_replies: 42,
          num_retweets: 89
        }
      },
      {
        signature: 'redsquare-mock-tx-002',
        timestamp: Date.now() - 4 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-rp',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text:
              'We are rebuilding RedSquare from scratch. Same functionality eventually, dramatically simpler architecture. Readability over cleverness.',
            images: [],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-002'
          }
        },
        optional: {
          num_likes: 156,
          num_replies: 23,
          num_retweets: 41
        }
      },
      {
        signature: 'redsquare-mock-tx-003',
        timestamp: Date.now() - 6 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-alice',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text:
              'The new component hierarchy is so clean. Parents render children, templates own all HTML, and every file makes sense on first read.',
            images: ['/saito/img/dreamscape.png'],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-003'
          }
        },
        optional: {
          num_likes: 94,
          num_replies: 12,
          num_retweets: 18
        }
      },
      {
        signature: 'redsquare-mock-tx-004',
        timestamp: Date.now() - 8 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-bob',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text:
              'Transactions become Tweet objects exactly once. After that the app never re-parses raw network data. This is the way.',
            images: [],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-004'
          }
        },
        optional: {
          num_likes: 67,
          num_replies: 8,
          num_retweets: 15
        }
      },
      {
        signature: 'redsquare-mock-tx-005',
        timestamp: Date.now() - 11 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-carol',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text:
              'Just shipped a pull request that deletes 2,000 lines of abstraction nobody understood. The rewrite feels right.',
            images: [],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-005'
          }
        },
        optional: {
          num_likes: 312,
          num_replies: 47,
          num_retweets: 102
        }
      },
      {
        signature: 'redsquare-mock-tx-006',
        timestamp: Date.now() - 14 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-dave',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text:
              'Open source social on a blockchain that actually scales. If you have not tried RedSquare yet, now is a good time.',
            images: ['/saito/img/dreamscape.png', '/saito/img/tiled-logo.svg'],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-006'
          }
        },
        optional: {
          num_likes: 45,
          num_replies: 6,
          num_retweets: 11
        }
      },
      {
        signature: 'redsquare-mock-tx-007',
        timestamp: Date.now() - 16 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-alice',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text: 'Three-image gallery layout — tall panel left, two stacked on the right.',
            images: [
              '/saito/img/dreamscape.png',
              '/saito/img/tiled-logo.svg',
              '/saito/img/dreamscape.png'
            ],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-007'
          }
        },
        optional: {
          num_likes: 38,
          num_replies: 4,
          num_retweets: 9
        }
      },
      {
        signature: 'redsquare-mock-tx-008',
        timestamp: Date.now() - 18 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-bob',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text: 'Four images in a balanced grid. Mixed orientations crop gracefully.',
            images: [
              '/saito/img/dreamscape.png',
              '/saito/img/tiled-logo.svg',
              '/saito/img/tiled-logo.svg',
              '/saito/img/dreamscape.png'
            ],
            parent_id: '',
            thread_id: 'redsquare-mock-tx-008'
          }
        },
        optional: {
          num_likes: 52,
          num_replies: 7,
          num_retweets: 14
        }
      },
      {
        signature: 'redsquare-mock-tx-009',
        timestamp: Date.now() - 20 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-carol',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text: 'Quoting this because it nails the architecture we are building toward.',
            images: [],
            embedded: {
              signature: 'redsquare-mock-tx-002',
              publicKey: 'redsquare-mock-pk-rp',
              text:
                'We are rebuilding RedSquare from scratch. Same functionality eventually, dramatically simpler architecture. Readability over cleverness.',
              images: [],
              created_at: Date.now() - 4 * 60 * 60 * 1000
            },
            parent_id: '',
            thread_id: 'redsquare-mock-tx-009'
          }
        },
        optional: {
          num_likes: 81,
          num_replies: 11,
          num_retweets: 22
        }
      },
      {
        signature: 'redsquare-mock-tx-010',
        timestamp: Date.now() - 22 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-dave',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text: 'Rich content block: commentary, gallery, and an embedded Tweet in one post.',
            images: ['/saito/img/dreamscape.png', '/saito/img/tiled-logo.svg'],
            embedded: {
              signature: 'redsquare-mock-tx-001',
              publicKey: 'redsquare-mock-pk-saito',
              text:
                'Welcome to RedSquare — peer-to-peer social media on the Saito network. No servers. No silos. Just people talking to people.',
              images: [],
              created_at: Date.now() - 2 * 60 * 60 * 1000
            },
            parent_id: '',
            thread_id: 'redsquare-mock-tx-010'
          }
        },
        optional: {
          num_likes: 127,
          num_replies: 19,
          num_retweets: 34
        }
      },
      {
        signature: 'redsquare-mock-tx-011',
        timestamp: Date.now() - 1.5 * 60 * 60 * 1000,
        from: [
          {
            publicKey: 'redsquare-mock-pk-alice',
            amount: '0',
            type: 1,
            index: 0,
            blockId: '0',
            txOrdinal: '0'
          }
        ],
        msg: {
          module: 'RedSquare',
          request: 'create tweet',
          data: {
            text: 'This is exactly what decentralized social should feel like.',
            images: [],
            parent_id: 'redsquare-mock-tx-001',
            thread_id: 'redsquare-mock-tx-001'
          }
        },
        optional: {
          num_likes: 18,
          num_replies: 2,
          num_retweets: 4
        }
      }
    ];
  }

  getMockNotificationTransactions() {
  const slip = (publicKey) => ({
    publicKey,
    amount: '0',
    type: 1,
    index: 0,
    blockId: '0',
    txOrdinal: '0'
  });

  return [
    {
      signature: 'redsquare-mock-like-001',
      timestamp: Date.now() - 25 * 60 * 1000,
      from: [slip('redsquare-mock-pk-alice')],
      msg: {
        module: 'RedSquare',
        request: 'like tweet',
        data: {
          signature: 'redsquare-mock-tx-001'
        }
      }
    },
    {
      signature: 'redsquare-mock-like-001b',
      timestamp: Date.now() - 18 * 60 * 1000,
      from: [slip('redsquare-mock-pk-alice')],
      msg: {
        module: 'RedSquare',
        request: 'like tweet',
        data: {
          signature: 'redsquare-mock-tx-001'
        }
      }
    },
    {
      signature: 'redsquare-mock-reply-notif-001',
      timestamp: Date.now() - 90 * 60 * 1000,
      from: [slip('redsquare-mock-pk-alice')],
      msg: {
        module: 'RedSquare',
        request: 'create tweet',
        data: {
          text: 'This is exactly what decentralized social should feel like.',
          images: [],
          parent_id: 'redsquare-mock-tx-001',
          thread_id: 'redsquare-mock-tx-001'
        }
      }
    },
    {
      signature: 'redsquare-mock-retweet-001',
      timestamp: Date.now() - 3 * 60 * 60 * 1000,
      from: [slip('redsquare-mock-pk-rp')],
      msg: {
        module: 'RedSquare',
        request: 'retweet',
        data: {
          signature: 'redsquare-mock-tx-009'
        }
      }
    },
    {
      signature: 'redsquare-mock-like-002',
      timestamp: Date.now() - 4 * 60 * 60 * 1000,
      from: [slip('redsquare-mock-pk-bob')],
      msg: {
        module: 'RedSquare',
        request: 'like tweet',
        data: {
          signature: 'redsquare-mock-tx-003'
        }
      }
    },
    {
      signature: 'redsquare-mock-mention-001',
      timestamp: Date.now() - 5 * 60 * 60 * 1000,
      from: [slip('redsquare-mock-pk-carol')],
      msg: {
        module: 'RedSquare',
        request: 'create tweet',
        data: {
          text: '@you the new notification architecture is looking clean.',
          images: [],
          parent_id: '',
          thread_id: 'redsquare-mock-mention-001',
          mentions: ['mock-user-public-key']
        }
      }
    },
    {
      signature: 'redsquare-mock-like-003',
      timestamp: Date.now() - 6 * 60 * 60 * 1000,
      from: [slip('redsquare-mock-pk-dave')],
      msg: {
        module: 'RedSquare',
        request: 'like tweet',
        data: {
          signature: 'redsquare-mock-tx-005'
        }
      }
    }
  ];
  }
}

module.exports = RedSquare;
