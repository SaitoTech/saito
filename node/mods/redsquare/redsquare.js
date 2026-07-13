const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Main = require('./lib/main');
const Tweet = require('./lib/tweet');
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

  addTweet(tx) {
    const tweet = new Tweet(this.app, this, tx);
    return this.manager.add(tweet);
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
      }
    ];
  }
}

module.exports = RedSquare;
