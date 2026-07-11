const ModTemplate = require('../../lib/templates/modtemplate');
const Main = require('./lib/main');
const Tweet = require('./lib/tweet');
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

    this.tweets = [];
    this.profile = null;

    this.main = null;

    this.styles = ['/saito/saito.css', '/redsquare/style.css'];
  }

  async initialize(app) {
    await super.initialize(app);

    if (app.BROWSER) {
      this.seedPlaceholderData();
    }
  }

  seedPlaceholderData() {
    if (this.tweets.length > 0) {
      return;
    }

    let tweets = [
      {
        text: 'Welcome to RedSquare — peer-to-peer social media on the Saito network. No servers. No silos. Just people talking to people.',
        user: { name: 'Saito Network', handle: 'saito', avatar: '/saito/img/dreamscape.png' },
        time: '2h',
        likes: 248,
        replies: 42,
        retweets: 89
      },
      {
        text: 'We are rebuilding RedSquare from scratch. Same functionality eventually, dramatically simpler architecture. Readability over cleverness.',
        user: { name: 'Richard P.', handle: 'rp', avatar: '/saito/img/tiled-logo.svg' },
        time: '4h',
        likes: 156,
        replies: 23,
        retweets: 41
      },
      {
        text: 'The new component hierarchy is so clean. Parents render children, templates own all HTML, and every file makes sense on first read.',
        user: { name: 'Alice Chen', handle: 'alice', avatar: '/saito/img/dreamscape.png' },
        time: '6h',
        likes: 94,
        replies: 12,
        retweets: 18,
        images: ['/saito/img/dreamscape.png']
      },
      {
        text: 'Transactions become Tweet objects exactly once. After that the app never re-parses raw network data. This is the way.',
        user: { name: 'Bob Martinez', handle: 'bob', avatar: '/saito/img/tiled-logo.svg' },
        time: '8h',
        likes: 67,
        replies: 8,
        retweets: 15
      },
      {
        text: 'Just shipped a pull request that deletes 2,000 lines of abstraction nobody understood. The rewrite feels right.',
        user: { name: 'Carol Okonkwo', handle: 'carol', avatar: '/saito/img/dreamscape.png' },
        time: '11h',
        likes: 312,
        replies: 47,
        retweets: 102
      },
      {
        text: 'Open source social on a blockchain that actually scales. If you have not tried RedSquare yet, now is a good time.',
        user: { name: 'Dave Kim', handle: 'dave', avatar: '/saito/img/tiled-logo.svg' },
        time: '14h',
        likes: 45,
        replies: 6,
        retweets: 11,
        images: ['/saito/img/dreamscape.png', '/saito/img/tiled-logo.svg']
      }
    ];

    for (let data of tweets) {
      let tweet = new Tweet(this.app, this);
      tweet.text = data.text;
      tweet.user = data.user;
      tweet.time = data.time;
      tweet.likes = data.likes;
      tweet.replies = data.replies;
      tweet.retweets = data.retweets;
      tweet.images = data.images || [];
      this.tweets.push(tweet);
    }

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

  async render() {
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (!this.main) {
      this.main = new Main(this.app, this);
    }

    await super.render();

    this.main.render();
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
}

module.exports = RedSquare;
