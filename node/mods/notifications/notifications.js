const ModTemplate = require('../../lib/templates/modtemplate');
const index = require('./index');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Tweet = require('./lib/tweet');
const NotificationsMain = require('./lib/main');

class Notifications extends ModTemplate {
  constructor(app) {
    super(app);

    this.app = app;
    this.appname = 'Notifications';
    this.name = 'Notifications';
    this.slug = 'notifications';
    this.description = 'RedSquare Refactor';

    this.tweets = {};

    this.ui = null;
    this.header = null;
  }

  async initialize(app) {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    for (let tx of this.getTweets()) {
      this.addTweet(tx);
    }

    if (!this.ui) {
      this.ui = new NotificationsMain(this.app, this, '.saito-container');
      this.header = new SaitoHeader(this.app, this);
    }
  }

  async render() {
    alert('render!');

    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    alert('rendering UI!');

    this.ui.render();
    this.header.render();
  }

  addTweet(tx) {
    if (typeof tx.isFrom === 'function' && tx.isFrom(this.publicKey)) {
      return false;
    }
    if (typeof tx.isTo === 'function' && !tx.isTo(this.publicKey)) {
      return false;
    }
    if (!tx || !tx.signature) {
      return false;
    }
    if (this.tweets[tx.signature]) {
      return false;
    }

    const tweet = new Tweet(this.app, this, '.tweets', { tx });

    this.tweets[tx.signature] = tweet;

    return true;
  }

  onConfirmation(blk, tx, conf) {
    if (conf === 0 && this.app?.BROWSER) {
      this.addTweet(tx);
    }
  }

  webServer(app, expressapp, express, alternative_slug = null) {
    const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
    const self = this;

    expressapp.use(uri, express.static(webdir));

    expressapp.get(uri, async function (req, res) {
      let html = index(app, self, app.build_number);
      res.setHeader('Content-type', 'text/html');
      res.charset = 'UTF-8';
      return res.send(html);
    });
  }

  getTweets() {
    return [
      {
        signature: 'sample-1',
        msg: {
          username: 'saito_core',
          time: '2m',
          text:
            'Longtime users are frustrated with X because it no longer works the way it used to.\n\n' +
            'Back in the early days of Twitter, your reach was simple and direct. If you had 5,000 or 20,000 followers, your posts were delivered to them in real time. It was a true chronological feed — your tweets showed up in the order you posted them, and your audience actually saw your content.\n\n' +
            'The “old” Twitter (pre-2016) was built around that real-time experience. Your voice reached the people who chose to follow you, without interference.\n\n' +
            'Today, that’s no longer the case. X relies on an algorithm-driven, engagement-based feed, meaning even your own followers may never see your posts unless the system decides to prioritize them.',
          parent_id: '',
          thread_id: 'sample-1',
          num_likes: 5,
          num_replies: 1,
          link: '',
          media: [],
          bridge_down: false
        }
      },
      {
        signature: 'sample-2',
        msg: {
          username: 'alice_dev',
          time: '15m',
          text: 'Tweet 2: Reply, has-parent only. No connector between 1 and 2.',
          parent_id: 'sample-1',
          thread_id: 'sample-2',
          num_likes: 2,
          num_replies: 0,
          link: '',
          media: ['https://picsum.photos/seed/saito-notifications-tweet2/800/450'],
          bridge_down: false
        }
      },
      {
        signature: 'sample-3',
        msg: {
          username: 'bob_network',
          time: '17m',
          text: 'Tweet 3: Parent of next reply (has-child). Connector shows below to Tweet 4.',
          parent_id: '',
          thread_id: 'sample-3',
          num_likes: 3,
          num_replies: 1,
          link: '',
          media: [],
          bridge_down: true
        }
      },
      {
        signature: 'sample-4',
        msg: {
          username: 'carol',
          time: '20m',
          text: 'Tweet 4: Reply, has-parent. Connector between 3 and 4.',
          parent_id: 'sample-3',
          thread_id: 'sample-4',
          num_likes: 1,
          num_replies: 0,
          link: '',
          media: [],
          bridge_down: false
        }
      },
      {
        signature: 'sample-5',
        msg: {
          username: 'validator_news',
          time: '1h',
          text: 'Tweet 5: Standalone, no thread classes. No connector.',
          parent_id: '',
          thread_id: 'sample-5',
          num_likes: 0,
          num_replies: 0,
          link: '',
          media: [],
          bridge_down: false
        }
      }
    ];
  }
}

module.exports = Notifications;
