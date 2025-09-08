const saito = require('./../../lib/saito/saito');
const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const SaitoCamera = require('../../lib/saito/ui/saito-camera/saito-camera');
const SaitoMain = require('./lib/main');
const RedSquareMenu = require('./lib/menu');
const TweetMenu = require('./lib/tweet-menu');
const Tweet = require('./lib/tweet');
const redsquareHome = require('./index');
const Post = require('./lib/post');
const Transaction = require('../../lib/saito/transaction').default;
const PeerService = require('saito-js/lib/peer_service').default;
const SaitoOverlay = require('./../../lib/saito/ui/saito-overlay/saito-overlay');
const AppSettings = require('./lib/settings');

////////////////////////////////////////////
//
// RedSquare depends on the Archive module for TX storage. This allows the
// module to fetch tweets from multiple machines using a consistent API,
// the loadTransactions() function.
//
// Transactions are fetched and submitted to the addTweet() function which
// creates a tweet /lib/tweet.js which is responsible for formatting and
// displaying itself as and when requested.
//
// On initial load the module fetches from localhost. Whenever peers that
// support Archives are added, they are added to a list of peers from
// which tweets can be requested.
//
///////////////////////////////////////////

class RedSquare extends ModTemplate {
  constructor(app) {
    super(app);

    this.appname = 'Red Square';
    this.name = 'RedSquare';
    this.slug = 'redsquare';
    this.description = 'Open Source Twitter-clone for the Saito Network';
    this.categories = 'Social Entertainment';
    this.icon_fa = 'fas fa-square-full';

    this.debug = false;

    this.tweets = []; // time sorted master list of tweets
    this.cached_tweets = []; // serialized-for-web version of curated_tweets
    this.last_cache = 0; // to prevent updating cache too frequently

    this.tweets_sigs_hmap = {};
    this.special_threads_hmap = {};
    this.unknown_children = [];
    this.orphan_edits = [];

    this.peers = [];
    this.keylist = {};

    this.tweet_count = 0;
    this.liked_tweets = [];
    this.retweeted_tweets = [];
    this.replied_tweets = [];
    this.hidden_tweets = [];

    this.notifications = [];
    this.notifications_sigs_hmap = {};

    this.jedi_council = new Map();

    //
    // controls whether non-curated tweets will render
    //
    this.curated = !this.debug;

    this.possibleHome = 1;

    this.use_floating_plus = 1;

    //
    // is this a notification?
    //
    this.notifications_earliest_tweet_ts = new Date().getTime();
    this.notifications_earliest_like_ts = new Date().getTime();
    this.notifications_last_viewed_ts = 0;
    this.notifications_number_unviewed = 0;

    this.tweets_earliest_ts = new Date().getTime();

    this.allowed_upload_types = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp'];

    this.styles = ['/redsquare/style.css'];
    this.postScripts = ['/saito/lib/emoji-picker/emoji-picker.js'];

    this.enable_profile_edits = true;

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
      image: 'https://saito.tech/wp-content/uploads/2022/04/saito_card.png' //square image with "Saito" below logo
      //image: "https://saito.tech/wp-content/uploads/2022/04/saito_card_horizontal.png",
    };

    this.app.connection.on('saito-render-complete', () => {
      this.app.connection.emit(
        'redsquare-update-notifications',
        this.notifications_number_unviewed
      );
    });

    this.app.connection.on('redsquare-new-post', (msg) => {
      let post = new Post(this.app, this);
      post.render();
    });

    this.app.connection.on('redsquare-post-tweet', (data, keys) => {
      this.sendTweetTransaction(this.app, this, data, keys);
    });

    this.app.connection.on('redsquare-home-render-request', () => {
      if (this.browser_active && this.orphan_edits.length > 0) {
        let orig_length = this.orphan_edits.length;
        for (let i = 0; i < orig_length; i++) {
          let orphan = this.orphan_edits.shift();
          this.editTweet(orphan.tweet_id, orphan.tx, orphan.source);
        }
        console.debug(
          `RS.home-render-request ${orig_length - this.orphan_edits.length} orphaned edits processed!`
        );
      }
    });

    return this;
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

  /////////////////////////////////
  // inter-module communications //
  /////////////////////////////////
  respondTo(type = '', obj) {
    let this_mod = this;

    if (type === 'user-menu') {
      return {
        text: `${
          obj?.publicKey && obj.publicKey === this.publicKey ? 'My' : 'View'
        } RedSquare Profile`,
        icon: 'fa fa-user',
        callback: function (app, publicKey) {
          if (this_mod?.menu) {
            this_mod.menu.openProfile(publicKey);
          } else {
            navigateWindow(`/redsquare/?user_id=${publicKey}`);
          }
        }
      };
    }

    if (type === 'saito-header') {
      let x = [];
      if (!this.browser_active) {
        x.push({
          text: 'RedSquare',
          icon: 'fa-solid fa-square',
          rank: 20,
          type: 'navigation',
          callback: function (app, id) {
            navigateWindow('/redsquare');
          },
          event: function (id) {
            this_mod.app.connection.on('redsquare-update-notifications', (unread) => {
              this_mod.app.browser.addNotificationToId(unread, id);
              this_mod.app.connection.emit('saito-header-notification', 'redsquare', unread);
            });
          }
        });
      } else {
        if (this.app.browser.isMobileBrowser() || window.innerWidth < 600) {
          x.push({
            text: 'RedSquare Home',
            icon: 'fa-solid fa-house',
            rank: 21,
            type: 'appspace',
            callback: function (app, id) {
              document.querySelector('.redsquare-menu-home').click();
            }
          });
          x.push({
            text: 'Notifications',
            icon: 'fas fa-bell',
            rank: 23,
            type: 'appspace',
            callback: function (app, id) {
              document.querySelector('.redsquare-menu-notifications').click();
            },
            event: function (id) {
              this_mod.app.connection.on('redsquare-update-notifications', (unread) => {
                this_mod.app.browser.addNotificationToId(unread, id);
                this_mod.app.connection.emit('saito-header-notification', 'redsquare', unread);
              });
            }
          });
          x.push({
            text: 'Profile',
            icon: 'fas fa-user',
            rank: 26,
            type: 'appspace',
            callback: function (app, id) {
              document.querySelector('.redsquare-menu-profile').click();
            }
          });
        }
      }

      return x;
    }

    if (type === 'saito-floating-menu') {
      let x = [];
      x.push({
        text: 'Tweet',
        icon: 'fa-solid fa-pen',
        is_active: this.browser_active,
        disallowed_mods: ['arcade'],
        rank: 10,
        callback: function (app, id) {
          let post = new Post(app, this_mod);
          post.render();
        }
      });

      x.push({
        text: 'Tweet Camera',
        icon: 'fas fa-camera',
        is_active: this.browser_active,
        disallowed_mods: ['arcade'],
        rank: 30,
        callback: function (app, id) {
          let post = new Post(app, this_mod);
          let camera = new SaitoCamera(app, this_mod, (img) => {
            post.render();
            post.addImg(img);
          });
          camera.render();
        }
      });

      x.push({
        text: 'Tweet Image',
        icon: 'fas fa-image',
        is_active: this.browser_active,
        disallowed_mods: ['arcade'],
        rank: 20,
        callback: function (app, id) {
          let post = new Post(app, this_mod);
          post.render();
          post.triggerClick('#hidden_file_element_tweet-overlay');
        }
      });
      return x;
    }

    if (type == 'game-menu') {
      //this.attachStyleSheets();
      //super.render(this.app, this);
      return {
        //id: 'game-share',
        //text: 'Share',
        submenus: [
          {
            parent: 'game-share',
            text: 'Tweet',
            id: 'game-tweet',
            class: 'game-tweet',
            callback: function (app, game_mod) {
              game_mod.menu.hideSubMenus();
              let post = new Post(app, this_mod);
              post.render();
            }
          }
        ]
      };
    }

    //
    // curation / moderation functions
    //
    // all tweets received are passed through this function, which indicates whether they
    // pass the curation function. -1 = fail / 0 = unsure / 1 = pass
    //
    if (type === 'saito-moderation-app') {
      return {
        //
        // default curation logic...
        //
        filter_func: (mod = null, tx = null) => {
          if (tx == null || mod == null || !tx?.from) {
            return 0;
          }

          if (mod.name !== this.name) {
            return 0;
          }

          if (this.hidden_tweets.includes(tx.signature)) {
            console.log('HIDDEN TWEET!!!!!');
            return -1;
          }

          return 0;
        }
      };
    }

    return null;
  }

  ////////////////////
  // initialization //
  ////////////////////
  //
  // this function runs whenever the browser or application is loaded. note that
  // at this point we probably do not have any network connections to any peers
  // so most of the work is pre-network init.
  //
  async initialize(app) {
    //
    // database setup etc.
    //
    await super.initialize(app);

    //
    // ensure easy-access in non-awaitable
    //
    this.publicKey = await app.wallet.getPublicKey();

    //
    // fetch content from options file
    //
    this.loadOptions();

    if (!app.BROWSER) {
      //////////////////////////////////
      // Special processing for servers
      //////////////////////////////////

      this.addPeer('localhost', 25);

      this.loadTweets('later', (tx_count) => {
        // Use curation to bootstrap jedi council
        for (let tweet of this.tweets) {
          if (tweet.curated == 1) {
            this.addToCouncil(tweet.tx.from[0].publicKey);
          }
        }

        // Create cache to serve with index.js
        this.cacheRecentTweets();
        console.debug(
          `  ===  RS -- Preloaded ${tx_count} transactions ~~ ${this.tweets.length} tweets`
        );

        //Specifically process last 50 game results

        this.app.storage.loadTransactions(
          {
            field1: 'RedSquare',
            field4: 'special', // game result tweets
            flagged: 0,
            limit: 50,
            created_earlier_than: Date.now()
          },
          (txs) => {
            this.processTweetsFromPeer(this.peers[0], txs);
            console.log('Loaded game results...');
          },
          'localhost'
        );
      });

      const nonRequests = ['like tweet', 'flag tweet', 'retweet', 'delete tweet', 'edit tweet'];
      const cleanUp = () => {
        this.app.storage.loadTransactions(
          {
            field1: 'RedSquare',
            field5: 'fixme',
            limit: 100
          },
          (txs) => {
            // processTweetsFromPeer
            for (let z = 0; z < txs.length; z++) {
              txs[z].decryptMessage(this.app);

              let txmsg = txs[z].returnMessage();
              //addTweet
              if (!nonRequests.includes(txmsg.request)) {
                let tweet = new Tweet(this.app, this, txs[z]);
                for (let xmod of this.app.modules.respondTo('redsquare-add-tweet')) {
                  tweet = xmod.respondTo('redsquare-add-tweet').processTweet(tweet);
                }

                let opt = {
                  field4: tweet.parent_id || '',
                  field5: tweet.thread_id || '',
                  timestamp: tweet.updated_at
                };
                if (tweet.rethread) {
                  opt.field4 = 'special';
                }

                this.app.storage.updateTransaction(tweet.tx, opt, 'localhost');
              }
            }

            if (txs.length) {
              setTimeout(cleanUp, 5000);
            }
          },
          'localhost'
        );
      };

      cleanUp();

      return;
    }

    //
    // add myself as peer...
    //
    this.addPeer('localhost');

    //
    // check tweets in pending txs
    //
    try {
      let user_id = this.app.browser.returnURLParameter('user_id');
      let tweet_id = this.app.browser.returnURLParameter('tweet_id');
      if (!tweet_id || !user_id) {
        let pending = await app.wallet.getPendingTransactions();
        for (let i = 0; i < pending.length; i++) {
          let tx = pending[i];
          let txmsg = tx.returnMessage();
          if (txmsg && txmsg.module == this.name) {
            if (txmsg.request === 'create tweet') {
              this.addTweet(tx, { type: 'pending_tx', node: 'wallet' });
            }
          }
        }
      }
    } catch (err) {
      console.error('RS.initialize: Error while checking pending txs: ', err);
    }
  }

  reset() {}

  ////////////
  // render //
  ////////////
  //
  // browsers run this to render the page. this also runs before the network is
  // likely functional, so it focuses on writing the components to the screen rather
  // that fetching content.
  //
  // content is loaded from the local cache, and then the "loading new tweets" indicator
  // is enabled, and when onPeerServiceUp() triggers we run a postcache-render-request
  // to update the page if it is in a state where that is permitted.
  //
  async render() {
    //
    // browsers only!
    //
    if (!this.app.BROWSER || !this.browser_active) {
      return;
    }

    if (window?.tweets?.length) {
      for (let z = 0; z < window.tweets.length; z++) {
        let newtx = new Transaction();
        newtx.deserialize_from_web(this.app, window.tweets[z]);
        this.addTweet(newtx, { type: 'server-cache', node: 'server' } /*, 1*/);
      }
    }

    //
    // create and render components
    //
    if (this.main == null) {
      this.main = new SaitoMain(this.app, this);
      this.header = new SaitoHeader(this.app, this);
      await this.header.initialize(this.app);
      this.menu = new RedSquareMenu(this.app, this, '.saito-sidebar.left');
      this.tweetMenu = new TweetMenu(this.app, this);

      this.addComponent(this.header);
      this.addComponent(this.main);
      this.addComponent(this.menu);

      //
      // chat manager goes in left-sidebar
      //
      for (const mod of this.app.modules.returnModulesRespondingTo('chat-manager')) {
        let cm = mod.respondTo('chat-manager');
        cm.container = '.saito-sidebar.left';
        cm.render_manager_to_screen = 1;
        this.addComponent(cm);
      }
    }

    await super.render();

    //
    // render right-sidebar components
    //
    this.app.modules.renderInto('.redsquare-sidebar');
  }

  /////////////////////
  // peer management //
  /////////////////////
  addPeer(peer, tweet_limit = 10) {
    let publicKey = peer?.publicKey || this.publicKey;

    let peer_idx = -1;

    for (let i = 0; i < this.peers.length; i++) {
      if (this.peers[i].publicKey === publicKey) {
        peer_idx = i;
      }
    }

    let peer_obj;

    if (peer_idx == -1) {
      peer_obj = {
        peer: peer,
        publicKey: publicKey,
        tweets_earliest_ts: new Date().getTime(),
        tweets_latest_ts: 0,
        tweets_limit: tweet_limit,
        busy: {}
      };
      this.peers.push(peer_obj);
    } else {
      this.peers[peer_idx].peer = peer;
      peer_obj = this.peers[peer_idx];
      console.log('RS.addPeer: peer refreshed -- ', peer_obj);
      return;
    }

    // Only set interval on new peers, (so we aren't setting multiple on network instability)
    if (this.browser_active) {
      this.loadTweets(
        'earlier',
        (tx_count) => {
          this.app.connection.emit('redsquare-home-postcache-render-request', tx_count);
        },
        peer_obj
      );

      //
      // auto-poll for new tweets, on 5 minute interval
      //
      setInterval(() => {
        this.loadTweets(
          'later',
          (tx_count) => {
            this.app.connection.emit('redsquare-home-postcache-render-request', tx_count);
          },
          peer
        );
      }, 300000);
    }
  }

  ////////////////////////
  // when peer connects //
  ////////////////////////
  async onPeerServiceUp(app, peer, service = {}) {
    //
    // avoid network overhead if in other apps
    //
    if (!this.browser_active) {
      return;
    }

    //
    // redsquare -- load tweets
    //
    if (service.service === 'archive') {
      //
      // add service peer, query and set up interval to poll every 5 minutes
      //
      this.addPeer(peer);

      this.archive_connected = true;

      if (this.browser_active) {
        siteMessage('Syncing Redsquare...', 2000);
        this.main.render();
      }
    }
  }

  ///////////////////////
  // network functions //
  ///////////////////////

  async handlePeerTransaction(app, tx = null, peer, mycallback) {
    if (tx == null) {
      return 0;
    }

    let txmsg = tx.returnMessage();

    if (!txmsg.request || txmsg.request !== 'load tweets') {
      return 0;
    }

    if (!mycallback) {
      return 0;
    }

    let txs = [];
    let need_to_check_archive = false;

    if (txmsg.data.created_earlier_than != undefined) {
      need_to_check_archive = true;
      for (let i = 0; i < this.tweets.length; i++) {
        if (this.tweets[i].created_at < txmsg.data.created_earlier_than) {
          this.tweets[i].tx.optional.updated_at = this.tweets[i].updated_at;
          txs.push(this.tweets[i].tx.serialize_to_web(app));
          delete this.tweets[i].tx.optional.updated_at;
          if (txs.length == 10) {
            need_to_check_archive = false;
            break;
          }
        }
      }
    } else if (txmsg.data.created_later_than != undefined) {
      for (let i = 0; i < this.tweets.length; i++) {
        if (this.tweets[i].created_at > txmsg.data.created_later_than) {
          this.tweets[i].tx.optional.updated_at = this.tweets[i].updated_at;
          txs.push(this.tweets[i].tx.serialize_to_web(app));
          delete this.tweets[i].tx.optional.updated_at;
        } else {
          break;
        }
      }
    }

    if (need_to_check_archive) {
      let last_index = this.tweets.length;

      this.loadTweets(
        'earlier',
        (count, peer) => {
          let optjson = JSON.stringify(this.tweets, (key, value) => {
            if (key == 'app') return 'app';
            if (key == 'mod') return 'mod';
            return typeof value === 'bigint' ? value.toString() : value; // return everything else unchanged
          });
          console.debug(
            `\n===\nEstimated RS Cache -- Memory load -- ${this.tweets.length} tweets, ${(optjson.length / 1048576).toFixed(3)}MB\n===\n`
          );

          for (let i = last_index; i < this.tweets.length; i++) {
            this.tweets[i].tx.optional.updated_at = this.tweets[i].updated_at;
            txs.push(this.tweets[i].tx.serialize_to_web(app));
            delete this.tweets[i].tx.optional.updated_at;
            if (txs.length == 10) {
              break;
            }
          }

          //
          // I guess it is possible *not* to hit the full 10 even after pulling 50 txs...
          //
          mycallback(txs);
        },
        this.peers[0]
      );
    } else {
      mycallback(txs);
    }

    return 1;
  }

  //
  // messages arrive on-chain over the network here
  //
  async onConfirmation(blk, tx, conf) {
    let txmsg = tx.returnMessage();

    if (conf == 0) {
      if (txmsg.request === 'delete tweet') {
        await this.receiveDeleteTransaction(blk, tx, conf, this.app);
        return;
      }
      if (txmsg.request === 'edit tweet') {
        await this.receiveEditTransaction(blk, tx, conf, this.app);
        return;
      }

      if (this.app.BROWSER) {
        this.addNotification(tx);
      }

      if (txmsg.request === 'create tweet') {
        await this.receiveTweetTransaction(blk, tx, conf, this.app);
        this.addTweet(tx, { type: 'on chain', node: blk.id });
      }
      if (txmsg.request === 'like tweet') {
        await this.receiveLikeTransaction(blk, tx, conf, this.app);
      }
      if (txmsg.request === 'flag tweet') {
        await this.receiveFlagTransaction(blk, tx, conf, this.app);
      }
      if (txmsg.request === 'retweet') {
        await this.receiveRetweetTransaction(blk, tx, conf, this.app);
      }
    }
  }

  loadTweets(created_at = 'earlier', mycallback, peer = null) {
    //
    // Instead of just passing the txs to the callback, we count how many of these txs
    // are new to us so we can have a better UX
    //
    let peer_count = 0;

    for (let i = 0; i < this.peers.length; i++) {
      if (!peer || peer.publicKey == this.peers[i].publicKey) {
        if (
          (created_at == 'earlier' &&
            this.peers[i].tweets_earliest_ts >= this.tweets_earliest_ts &&
            this.peers[i].tweets_earliest_ts > 0) ||
          (created_at == 'later' && this.peers[i].tweets_latest_ts >= 0)
        ) {
          peer_count++;

          if (this.peers[i].busy[created_at]) {
            this.peers[i].busy[created_at].push(mycallback);
            console.warn('RS.loadTweets already waiting on a response from this peer!');
            continue;
          }

          this.peers[i].busy[created_at] = [mycallback];

          if (this.peers[i].publicKey == this.publicKey) {
            let obj = {
              field1: 'RedSquare',
              field4: '', // no parent id!
              flagged: 0,
              //tx_size_less_than: 1330000,
              limit: this.peers[i].tweets_limit
            };

            if (created_at == 'earlier') {
              obj.created_earlier_than = this.peers[i].tweets_earliest_ts;
            } else if (created_at == 'later') {
              obj.created_later_than = this.peers[i].tweets_latest_ts;
            }

            this.app.storage.loadTransactions(
              obj,
              (txs) => {
                let count = this.processTweetsFromPeer(this.peers[i], txs);

                if (txs.length < this.peers[i].tweets_limit) {
                  console.debug('RS: Mark peer as tapped out: ' + created_at);
                  if (created_at === 'earlier') {
                    this.peers[i].tweets_earliest_ts = 0;
                    this.tweets_earliest_ts = 0;
                  } else {
                    this.peers[i].tweets_latest_ts = -1;
                  }
                }

                console.debug(
                  `RS.loadTweets localhost [${created_at}] returned ${count}. New feed length: ${this.tweets.length}`
                );

                for (let cb of this.peers[i].busy[created_at]) {
                  if (typeof cb === 'function') {
                    cb(count, this.peers[i]);
                  }
                }
                this.peers[i].busy[created_at] = null;
              },
              'localhost'
            );
          } else {
            let obj = {};
            if (created_at == 'earlier') {
              obj.created_earlier_than = this.peers[i].tweets_earliest_ts;
            } else if (created_at == 'later') {
              obj.created_later_than = this.peers[i].tweets_latest_ts;
            }

            console.debug(`RS.loadTweets requesting ${created_at} tweets from remote peer...`);
            this.app.network.sendRequestAsTransaction(
              'load tweets',
              obj,
              (txs) => {
                for (let i = 0; i < txs.length; i++) {
                  let tx = new Transaction();
                  tx.deserialize_from_web(this.app, txs[i]);
                  tx['updated_at'] = tx.optional.updated_at;
                  delete tx.optional.updated_at;
                  txs[i] = tx;
                }

                let count = this.processTweetsFromPeer(this.peers[i], txs);

                if (created_at === 'earlier') {
                  if (txs.length == 0) {
                    console.debug('RS: Mark remote peer as tapped out...');
                    this.peers[i].tweets_earliest_ts = 0;
                    //this.tweets_earliest_ts = 0;
                  }
                }

                console.debug(
                  `RS.loadTweets remote [${created_at}] returned ${count}. New feed length: ${this.tweets.length}`
                );

                for (let cb of this.peers[i].busy[created_at]) {
                  if (typeof cb === 'function') {
                    cb(count, this.peers[i]);
                  }
                }
                this.peers[i].busy[created_at] = null;
              },
              this.peers[i].peer.peerIndex
            );
          }
        }
      }
    }

    if (!peer_count) {
      console.warn('RS.loadTweets No valid peers...');
    }

    return peer_count;
  }

  ///////////////////////////////
  // content loading functions //
  ///////////////////////////////
  //
  // there are three major functions that are called to fetch more content:
  //
  // - loadProfile()
  // - loadTweets()
  // - loadNotifications()
  //
  // these will trigger calls to all of the peers that have been added and
  // fetch more content from all of them up until there is no more content
  // to fetch and display. this content will be fetched and returned in the
  // form of transactions that can be fed to addTweets()
  //
  loadTweetsFromArchive(created_at = 'earlier', mycallback, peer = null) {
    //
    // Instead of just passing the txs to the callback, we count how many of these txs
    // are new to us so we can have a better UX
    //
    let peer_count = 0;

    for (let i = 0; i < this.peers.length; i++) {
      //
      // we have two stop conditions,
      //
      // 1) when our peer has been tapped out on earlier (older) tweets, we stop querying them.
      //
      // 2) if we are our own peer, don't look for later (newer) tweets
      //
      // the second should keep the "loading" message flashing longer
      // though this is a hack and we will need to fix once we are loading from multiple remote peers
      // it is just a bit of a pain because we have triply nested callbacks...
      //
      if (
        !(created_at == 'earlier' && this.peers[i].tweets_earliest_ts <= this.tweets_earliest_ts) &&
        !(
          created_at == 'later' &&
          this.peers[i].publicKey == this.publicKey &&
          this.peers[i].tweets_latest_ts > 0
        ) &&
        (!peer || peer.publicKey == this.peers[i].publicKey)
      ) {
        peer_count++;

        let obj = {
          field1: 'RedSquare',
          field4: '', // no parent id!
          flagged: 0,
          //tx_size_less_than: 1330000,
          limit: this.peers[i].tweets_limit
        };

        if (created_at == 'earlier') {
          obj.created_earlier_than = this.peers[i].tweets_earliest_ts;
          if (this.debug) {
            console.debug(
              `RS.loadTweets: fetch earlier tweets from ${this.peers[i].publicKey} / ${new Date(this.peers[i].tweets_earliest_ts)} / Main: ${this.tweets_earliest_ts}`
            );
          }
        } else if (created_at == 'later') {
          obj.created_later_than = this.peers[i].tweets_latest_ts;
        }

        this.app.storage.loadTransactions(
          obj,
          (txs) => {
            let count = 0;

            if (txs.length > 0) {
              count = this.processTweetsFromPeer(this.peers[i], txs);

              if (this.debug) {
                let new_ts =
                  created_at == 'later'
                    ? `New latest timestamp -- ${new Date(this.peers[i].tweets_latest_ts)}`
                    : `New earliest timestamp -- ${new Date(this.peers[i].tweets_earliest_ts)}`;
                console.debug(
                  `RS.loadTweets-${i} (${this.peers[i].publicKey}): returned ${
                    txs.length
                  } ${created_at} tweets, ${count} are new to the feed. ${new_ts}`
                );
              }
            }

            if (created_at === 'earlier') {
              if (txs.length < this.peers[i].tweets_limit) {
                if (this.debug) {
                  console.debug(
                    `RS.loadTweets-${i} (${this.peers[i].publicKey}) peer out of earlier tweets. Mark as closed`
                  );
                }
                //this.peers[i].tweets_earliest_ts = 0;
              }
            }

            if (this.peers[i].tweets_earliest_ts < this.tweets_earliest_ts) {
              this.tweets_earliest_ts = this.peers[i].tweets_earliest_ts;
            }

            if (mycallback) {
              mycallback(count, this.peers[i]);
            }
          },
          this.peers[i].peer
        );
      }
    }

    if (mycallback && !peer_count) {
      console.debug('RS.loadTweets -- no peers to load from', this.tweets_earliest_ts, this.peers);
      //console.debug('RS.loadTweets -- no peers to load from, calling null callback');
      mycallback(0, null);
    }

    return peer_count;
  }

  processTweetsFromPeer(peer, txs) {
    let count = 0;

    //
    // sanity-check in case blocked tweets have come through via
    // saving in local-storage or whitelisting by peers.
    //
    if (this.debug) {
      console.debug(
        `RS.processTweetsFromPeer: checking ${txs.length} tweet transaction against my current ${this.tweets.length}`
      );
    }

    for (let z = 0; z < txs.length; z++) {
      txs[z].decryptMessage(this.app);

      //////////////////////////////////////////////////
      // if (this.browser_active) console.log(txs[z].timestamp, txs[z].updated_at);
      //////////////////////////////////////////////////

      if (txs[z].timestamp < peer.tweets_earliest_ts) {
        peer.tweets_earliest_ts = txs[z].timestamp;

        this.tweets_earliest_ts = Math.min(this.tweets_earliest_ts, peer.tweets_earliest_ts);
      }
      if (txs[z].timestamp > peer.tweets_latest_ts) {
        peer.tweets_latest_ts = txs[z].timestamp;
      }

      let source = {
        type: 'archive',
        node: peer.publicKey || peer
      };

      if (peer.publicKey == this.publicKey) {
        source.node = 'localhost';
      }

      let added = this.addTweet(txs[z], source);
      let tweet = this.returnTweet(txs[z].signature);

      if (tweet) {
        //
        // save w. metadata
        //
        if (peer.publicKey != this.publicKey) {
          this.saveTweet(tweet, 0);
        }

        count += added;
      }
    }

    return count;
  }

  //
  // We have two types of notifications that are slightly differently indexed, so
  // we are doing some fancy work to load all the transactions into one big list and then
  // process it at once. We are only looking at local archive storage because browsers should
  // be saving the txs that are addressed to them (i.e. notifications), but we can easily expand this
  // logic to also query remote sources (by changing return_count to the 2x number of peers)
  //
  loadNotifications(mycallback = null) {
    let notifications = [];
    let return_count = 0;

    //
    // This is the callback to process the returned tweets,
    // which we DONT want to just insert into the feed
    //
    const middle_callback = () => {
      let new_notifications = [];

      console.info(
        `RS.loadNotifications: process ${notifications.length} combined tweet and like notifications`
      );

      if (notifications.length > 0) {
        for (let z = 0; z < notifications.length; z++) {
          notifications[z].decryptMessage(this.app);

          if (this.addNotification(notifications[z])) {
            new_notifications.push(notifications[z]);
          }
        }
      } else {
        console.info('RS.loadNotifications: last notification fetch returned nothing');
        this.notifications_earliest_ts = 0;
      }

      console.info(
        `RS.loadNotifications: Appending ${new_notifications.length} new notification notices to the page`
      );

      if (mycallback) {
        mycallback(new_notifications);
      }
    };

    if (this.notifications_earliest_tweet_ts) {
      return_count++;

      //if (this.debug) {
      console.debug(`RS.loadNotifications: query tweet notifications`);
      // }

      this.app.storage.loadTransactions(
        {
          field1: 'RedSquare',
          field3: this.publicKey,
          created_earlier_than: this.notifications_earliest_tweet_ts
        },
        (txs) => {
          for (let tx of txs) {
            if (tx.timestamp < this.notifications_earliest_tweet_ts) {
              this.notifications_earliest_tweet_ts = tx.timestamp;
            }
            notifications.push(tx);
          }

          //if (this.debug) {
          console.debug(`RS.loadNotifications: Found ${txs.length} tweets`);
          //}

          return_count--;
          if (return_count == 0) {
            middle_callback();
          } else {
            console.debug('Process tweets first!');
          }
        },
        'localhost'
      );
    }

    if (this.notifications_earliest_like_ts) {
      return_count++;

      console.debug(`RS.loadNotifications: query like notifications`);

      //
      // Okay, so using a special like tag to make profile loading easier
      // complicates notifications loading... it would be nice if our arbitrary
      // archive fields weren't completely occupied by module/from/to...
      // This will need fixing if/when we change the archive schema (13 Nov 2023)
      //
      this.app.storage.loadTransactions(
        {
          field1: 'RedSquareLike',
          field3: this.publicKey,
          created_earlier_than: this.notifications_earliest_like_ts
        },
        (txs) => {
          for (let tx of txs) {
            if (tx.timestamp < this.notifications_earliest_like_ts) {
              this.notifications_earliest_like_ts = tx.timestamp;
            }
            notifications.push(tx);
          }

          //if (this.debug) {
          console.debug(`RS.loadNotifications: Found ${txs.length} likes`);
          //}

          return_count--;
          if (return_count == 0) {
            middle_callback();
          }
        },
        'localhost'
      );
    }

    if (!this.notifications_earliest_like_ts && !this.notifications_earliest_tweet_ts) {
      //
      // Just return empty array if we don't query the peers again
      //
      if (mycallback) {
        mycallback([]);
      }
    }
  }

  loadTweetThread(thread_id, mycallback = null) {
    if (!mycallback) {
      return;
    }

    siteMessage(`Checking peers for more replies...`, 1000);

    let peer_count = this.peers.length;

    for (let i = 0; i < this.peers.length; i++) {
      this.app.storage.loadTransactions(
        {
          field1: 'RedSquare',
          field5: thread_id,
          flagged: 0
        },
        (txs) => {
          console.log(`${this.peers[i].publicKey} returned ${txs.length} txs`);
          if (txs.length > 0) {
            for (let z = 0; z < txs.length; z++) {
              txs[z].decryptMessage(this.app);
              this.addTweet(txs[z], { type: 'tweet_thread', node: this.peers[i].publicKey });
            }
          }

          if (this.peers[i].peer !== 'localhost') {
            siteMessage(
              `Processing ${txs.length} tweets from ${this.app.keychain.returnUsername(this.peers[i].publicKey)}...`,
              1000
            );
          } else {
            siteMessage(`Processing ${txs.length} tweets from my archive...`, 1000);
          }

          peer_count--;
          if (peer_count > 0) {
            siteMessage(`Still waiting on ${peer_count} peer(s)...`, 1000);
          } else {
            if (mycallback) {
              mycallback(txs);
            }
          }
        },
        this.peers[i].peer
      );
    }
  }

  //
  // Prioritize looking for the specific tweet
  // 1) in my tweet list
  // 2) in my local archive
  // 3) in my peer archives
  //  It would be useful if we could convert everything to async and have a return value
  //  so that we can avoid callback hell when we really want to get that tweet to process something on it
  //
  loadTweetWithSig(sig, mycallback = null) {
    let redsquare_self = this;

    if (mycallback == null) {
      return;
    }

    let t = this.returnTweet(sig);

    if (t != null) {
      mycallback([t.tx]);
      return;
    }

    this.app.storage.loadTransactions(
      { sig, field1: 'RedSquare' },
      (txs) => {
        if (txs.length > 0) {
          for (let z = 0; z < txs.length; z++) {
            txs[z].decryptMessage(this.app);
            this.addTweet(txs[z], { type: 'loadTweetWithSig', node: 'localhost' });
          }
          mycallback(txs);
        } else {
          for (let i = 0; i < this.peers.length; i++) {
            if (this.peers[i].publicKey !== this.publicKey) {
              this.app.storage.loadTransactions(
                { sig, field1: 'RedSquare' },
                (txs) => {
                  if (txs.length > 0) {
                    for (let z = 0; z < txs.length; z++) {
                      txs[z].decryptMessage(this.app);
                      this.addTweet(txs[z], {
                        type: 'loadTweetWithSig',
                        node: this.peers[i].publicKey
                      });
                    }
                    mycallback(txs);
                  }
                },
                this.peers[i].peer
              );
            }
          }
        }
      },
      'localhost'
    );
  }

  ///////////////
  // add tweet //
  ///////////////
  //
  // this creates the tweet and adds it to the internal list that we maintain of
  // the tweets that holds them in a structured tree (parents hold children, etc.)
  // while also maintaining a separate list of the notifications, etc. this function
  // also indexes the tweets as needed in the various hashmaps so they can be
  // retrieved by returnTweet()
  //
  // this does not DISPLAY any tweets, although it makes sure that when they are
  // added they will render into the TWEET MANAGER component.
  //
  // returns 1 if this is a new tweet that can be displayed
  //
  addTweet(tx, source = null, override_curation = 0) {
    //
    // if this is a like or flag tx, it isn't anything to add to the feed so stop here
    //
    let txmsg = tx.returnMessage();

    if (source) {
      source.ts = new Date().getTime();
      if (tx.optional) {
        source.optional = Object.assign({}, tx.optional);
      }
    }

    if (
      txmsg.request === 'like tweet' ||
      txmsg.request === 'flag tweet' ||
      txmsg.request === 'retweet'
    ) {
      if (this.debug && this.browser_active) {
        console.debug("RS.addTweet -- Don't process " + txmsg.request);
      }
      return 0;
    }

    if (txmsg.request === 'delete tweet' && this.app.BROWSER) {
      if (this.debug && this.browser_active) {
        console.debug('RS.addTweet -- process ' + txmsg.request);
      }
      this.receiveDeleteTransaction(0, tx, 0, this.app);
      return 0;
    }

    if (txmsg.request === 'edit tweet') {
      if (this.debug && this.browser_active) {
        console.debug('RS.addTweet -- process ' + txmsg.request);
      }

      this.editTweet(txmsg.data.tweet_id, tx, source);
      return 0;
    }

    //
    // we may be attempting to add a tweet that we already have in our hashmap, in
    // this case we want to load our existing tweet and update the stats for it that
    // already exist in our memory, such as updated an edited version of the text.
    // once we have updated the tweet information, we can optionally signal whether
    // we want to re-render it.
    //
    if (this.tweets_sigs_hmap[tx.signature]) {
      let t = this.returnTweet(tx.signature);

      if (this.debug && this.browser_active) {
        console.debug(
          `RS.addTweet: Duplicate! Feed length: (${this.tweets.length}) -- `,
          t?.text,
          source
        );
      }

      if (!t) {
        return 0;
      }

      //
      // We push this additional source for record keeping
      //
      t.sources.push(source);

      if (tx.optional) {
        let should_rerender = false;

        if (tx.optional.num_replies > t.tx.optional.num_replies) {
          t.tx.optional.num_replies = tx.optional.num_replies;
        }
        if (tx.optional.num_retweets > t.tx.optional.num_retweets) {
          t.tx.optional.num_retweets = tx.optional.num_retweets;
          t.tx.optional.retweeters = tx.optional.retweeters;
          should_rerender = true;
        }
        if (tx.optional.num_likes > t.tx.optional.num_likes) {
          t.tx.optional.num_likes = tx.optional.num_likes;
        }
        if (tx.optional.update_tx) {
          t.tx.optional.update_tx = tx.optional.update_tx;
          should_rerender = true;
        }
        let tx_updated_at = tx.updated_at || tx.timestamp;
        if (tx_updated_at > t.updated_at) {
          t.updated_at = Math.max(t.updated_at, tx_updated_at);
          should_rerender = true;
          if (tx.optional.link_properties) {
            t.tx.optional.link_properties = tx.optional.link_properties;
          }
        }

        if (tx.optional.curated && !t.curated) {
          // Update curation value if (1/-1)
          t.tx.optional.curated = tx.optional.curated;
          t.curated = tx.optional.curated;

          delete t.curation_check;

          if (tx.optional.curation_check !== 'undefined') {
            t.tx.optional.curation_check = tx.optional.curation_check;
          }
          should_rerender = true;
        }

        t.rerenderControls(should_rerender);

        //this.updateSavedTweet(tx.signature);
      }

      return 0;
    }

    //
    // create the tweet
    //
    let tweet = new Tweet(this.app, this, tx);

    if (!tweet?.tx) {
      console.warn('RS.addTweet -- Created a tweet with a null tx');
      return 0;
    }

    //
    // This should be the first, primary source
    //
    tweet.sources.push(source);

    //
    // curation: accept the curated parameter if 1, or fallback on algorithmic curation
    //
    tweet.curated = override_curation || this.curate(tx);
    // So we don't lose our curation if rerendering tweet after an archival pull
    tweet.tx.optional.curated = tweet.curated;

    if (tweet.curation_check) {
      if (tweet.curated == 1) {
        console.log('We already accept the tweet to test!');
        delete tweet.curation_check;
        delete tweet.tx.optional.curation_check;
      }
    }

    //
    // new tweet added, so we gives modules freedom-to-annotate
    //
    for (let xmod of this.app.modules.respondTo('redsquare-add-tweet')) {
      tweet = xmod.respondTo('redsquare-add-tweet').processTweet(tweet);
    }

    if (tweet.rethread) {
      //
      // Flag tweet as rethread and null thread_id --> do not display!
      //
      if (!tweet.thread_id) {
        if (this.debug && this.browser_active) {
          console.debug('RS.addTweet -- ignore marked tweet');
        }
        this.tweets_sigs_hmap[tweet.tx.signature] = 2;
        return 0;
      }

      //
      //  keep track of list of special threads
      //
      if (this.special_threads_hmap[tweet.thread_id]) {
        if (this.debug && this.browser_active) {
          console.debug(
            'RS.addTweet -- inserting marked tweet into existing thread',
            tweet?.thread_id
          );
        }
        for (let i = 0; i < this.tweets.length; i++) {
          if (this.tweets[i].thread_id == tweet.thread_id) {
            if (tweet.thread_id.created_at > this.tweets[i].thread_id.created_at) {
              this.tweets_sigs_hmap[tweet.tx.signature] = 1;
              delete this.tweets_sigs_hmap[this.tweets[i].tx.signature];

              this.tweets[i].parent_id = tweet.tx.signature;
              let should_render = this.tweets[i].isRendered();
              this.tweets[i].remove();
              tweet.addTweet(this.tweets[i]);
              this.tweets[i] = tweet;
              if (should_render) {
                tweet.render(true);
              }
            } else {
              tweet.parent_id = this.tweets[i].tx.signature;
              this.tweets[i].addTweet(tweet);
              this.tweets[i].rerenderControls(true);
            }
            return -1;
          }
        }

        console.warn('RS.addTweet -- Thread not found!');
        return 0;
      }
      if (this.debug && this.browser_active) {
        console.debug('RS.addTweet -- new special tweet thread', tweet?.thread_id);
      }
      this.special_threads_hmap[tweet.thread_id] = 1;

      // Insert as normal
    }

    //
    // tweets are displayed in chronological order
    //
    if (!tweet.parent_id) {
      let insertion_index = 0;
      for (let i = 0; i < this.tweets.length; i++) {
        if (this.tweets[i].created_at > tweet.created_at) {
          insertion_index++;
        } else {
          this.out_of_order = true;
          break;
        }
      }

      this.tweets.splice(insertion_index, 0, tweet);
      this.tweets_sigs_hmap[tweet.tx.signature] = 1;

      for (let i = 0; i < this.unknown_children.length; i++) {
        if (this.unknown_children[i].thread_id === tweet.tx.signature) {
          tweet.addTweet(this.unknown_children[i]);
          this.unknown_children.splice(i, 1);
          i--;
        }
      }

      if (this.debug && this.browser_active) {
        console.debug(
          `\n===\nRS.addTweet Success! Feed has (${this.tweets.length}) -- `,
          tweet.text.substring(0, 50),
          source.node,
          `Curated: ${tweet.curated}`
        );
      }

      return 1;

      //
      // this is a comment / reply
      //
      // we find the tweet that is the parent and push it into the array
      // at that point. otherwise, we mark it as an unknown_child which
      // means we know it HAS a parent but we do not -- as of yet -- have
      // a copy of that tweet.
      //
    } else {
      for (let i = 0; i < this.tweets.length; i++) {
        if (this.tweets[i].tx.signature === tweet.thread_id) {
          this.tweets[i].addTweet(tweet);
          this.tweets_sigs_hmap[tweet.tx.signature] = 1;

          if (this.debug && this.browser_active) {
            console.debug(
              `RS.addTweet: child tweet success! Feed length: (${this.tweets.length}) -- `,
              tweet.text,
              source
            );
          }

          return -1;
        }
      }

      this.unknown_children.push(tweet);
      this.tweets_sigs_hmap[tweet.tx.signature] = 1;

      if (this.debug && this.browser_active) {
        console.debug(
          `RS.addTweet: unknown child! Feed length: (${this.tweets.length}) -- `,
          tweet.text,
          source
        );
      }

      return -1;
    }
  }

  //
  // addTweets adds notifications, but we have a separate function here
  // for cached notifications, because we don't want to show all of the
  // cached notifications in the main thread automatically, and we want a
  // dedicated function that tells us if this notification is new or not
  //
  addNotification(tx) {
    if (tx.isTo(this.publicKey)) {
      if (!tx.isFrom(this.publicKey)) {
        //
        // only insert notification if doesn't already exist
        //
        if (this.notifications_sigs_hmap[tx.signature] != 1) {
          if (this.debug) {
            console.debug('RS.addNotification', tx.msg, tx.timestamp);
          }

          let insertion_index = 0;

          for (let i = 0; i < this.notifications.length; i++) {
            if (tx.timestamp > this.notifications[i].timestamp) {
              break;
            } else {
              insertion_index++;
            }
          }

          this.notifications.splice(insertion_index, 0, tx);
          this.notifications_sigs_hmap[tx.signature] = 1;

          if (tx.timestamp > this.notifications_last_viewed_ts) {
            this.notifications_number_unviewed = this.notifications_number_unviewed + 1;
            this.app.connection.emit(
              'redsquare-update-notifications',
              this.notifications_number_unviewed
            );
          }

          this.saveOptions();

          return 1;
        } else {
          console.debug('RS.addNotification duplicate notification');
        }
      }
    }

    return 0;
  }

  resetNotifications() {
    this.notifications_last_viewed_ts = new Date().getTime();
    this.notifications_number_unviewed = 0;
    this.saveOptions();

    this.app.connection.emit('redsquare-update-notifications', this.notifications_number_unviewed);
  }

  returnTweet(tweet_sig = null) {
    if (tweet_sig == null) {
      return null;
    }

    if (!this.tweets_sigs_hmap[tweet_sig]) {
      return null;
    }

    for (let i = 0; i < this.tweets.length; i++) {
      if (this.tweets[i].tx.signature === tweet_sig) {
        return this.tweets[i];
      }
      if (this.tweets[i].hasChildTweet(tweet_sig)) {
        return this.tweets[i].returnChildTweet(tweet_sig);
      }
    }

    for (let j = 0; j < this.unknown_children.length; j++) {
      if (this.unknown_children[j].tx.signature === tweet_sig) {
        return this.unknown_children[j];
      }
    }

    return null;
  }

  removeTweet(tweet_sig = null) {
    if (!tweet_sig || !this.tweets_sigs_hmap[tweet_sig]) {
      return;
    }

    this.tweets_sigs_hmap[tweet_sig] = 0;

    for (let i = 0; i < this.tweets.length; i++) {
      if (this.tweets[i].tx.signature === tweet_sig) {
        this.tweets[i].remove();
        this.tweets.splice(i, 1);
        return;
      }

      if (this.tweets[i].hasChildTweet(tweet_sig)) {
        this.tweets[i].removeChildTweet(tweet_sig);
        return;
      }
    }

    for (let j = 0; j < this.unknown_children.length; j++) {
      if (this.unknown_children[j].tx.signature === tweet_sig) {
        this.unknown_children.splice(j, 1);
        return;
      }
    }
  }

  pruneTweets() {
    this.unknown_children = [];
    let pruned = [];
    let count = 0;
    if (this.tweets.length > 100) {
      for (let i = 0; count < 90 && i < this.tweets.length; i++) {
        if (this.tweets[i].curated == 1) {
          pruned.push(this.tweets[i]);
          count++;
        }
      }
    }
    this.tweets = pruned;
  }

  returnNotification(tweet_sig = null) {
    if (tweet_sig == null) {
      return null;
    }

    if (!this.notifications_sigs_hmap[tweet_sig]) {
      return null;
    }

    for (let i = 0; i < this.notifications.length; i++) {
      if (this.notifications[i].signature === tweet_sig) {
        return this.notifications[i];
      }
    }

    return null;
  }

  returnThreadSigs(root_id, child_id) {
    let sigs = [];
    let tweet = this.returnTweet(child_id);
    if (!tweet) {
      return [root_id];
    }
    let parent_id = tweet.parent_id;

    sigs.push(child_id);
    while (parent_id != '' && parent_id != root_id) {
      let x = this.returnTweet(parent_id);
      if (!x) {
        parent_id = root_id;
      } else {
        if (x.parent_id != '') {
          sigs.push(parent_id);
          parent_id = x.parent_id;
        } else {
          parent_id = root_id;
        }
      }
    }
    if (child_id != root_id) {
      sigs.push(root_id);
    }
    return sigs;
  }

  ///////////////////////
  // network functions //
  ///////////////////////
  async sendLikeTransaction(app, mod, data, tx) {
    let redsquare_self = this;

    let obj = {
      module: redsquare_self.name,
      request: 'like tweet',
      data: {}
    };
    for (let key in data) {
      obj.data[key] = data[key];
    }

    let newtx = await redsquare_self.app.wallet.createUnsignedTransaction(tx.from[0]?.publicKey);

    //
    // All tweets include the sender in the to, but add the from first so they are in first position
    //
    for (let i = 0; i < tx.to.length; i++) {
      if (tx.to[i].publicKey !== this.publicKey) {
        newtx.addTo(tx.to[i].publicKey);
      }
    }

    newtx.msg = obj;
    await newtx.sign();
    await redsquare_self.app.network.propagateTransaction(newtx);

    return newtx;
  }

  addToCouncil(key) {
    let trust_rating = this.jedi_council.has(key) ? this.jedi_council.get(key) : 0;
    trust_rating++;
    this.jedi_council.set(key, trust_rating);
    if (trust_rating > 12) {
      this.app.connection.emit('saito-whitelist', { publicKey: key });
    }
  }

  updateTweetCuration(tweet, interaction_tx) {
    //
    // set as curated if liked by moderator, but ignore blacklisted people
    //
    let new_curation = Math.max(0, this.curate(interaction_tx));

    if (new_curation == 1) {
      //console.debug('RS move tweet to curated by trusted like/retweet!');
      this.addToCouncil(tweet.tx.from[0].publicKey);
    }

    tweet.curated = new_curation || tweet.curated;
  }

  async updateTweetStat(tweet_tx, ts, stat, tweet = null) {
    if (!tweet_tx.optional) {
      tweet_tx.optional = {};
    }

    if (!tweet_tx.optional[stat]) {
      tweet_tx.optional[stat] = 0;
    }

    let obj = { timestamp: ts };

    let tweet_ts = tweet_tx.updated_at || tweet_tx.optional.updated_at || tweet_tx.timestamp;

    if (ts > tweet_ts) {
      //console.debug(`RS.updateTweetStat: increment ${stat}`);
      tweet_tx.optional[stat]++;
      await this.app.storage.updateTransaction(tweet_tx, obj, 'localhost');
    } else {
      //console.warn(`RS.updateTweetStat: don't increment ${stat}`, ts, tweet_ts);
    }
  }

  async receiveLikeTransaction(blk, tx, conf, app) {
    let txmsg = tx.returnMessage();

    //console.debug('Receive like transaction');

    let liked_tweet = this.returnTweet(txmsg.data.signature);

    //
    // save optional likes
    //
    if (liked_tweet?.tx) {
      this.updateTweetCuration(liked_tweet, tx);
      await this.updateTweetStat(liked_tweet.tx, tx.timestamp, 'num_likes', liked_tweet);

      liked_tweet.rerenderControls();
    } else if (!this.app.BROWSER) {
      //
      // fetch original
      //
      // servers load from themselves
      //
      // servers update their TX.updated_at timestamps based on current_time, since they won't be
      // fetching the blockchain transiently afterwards while viewing tweets that have loaded from
      // others. this permits browsers to avoid double-liking tweets that show up with pre-calculated
      // likes, as those will also have pre-updated updated_at values.
      //
      // this isn't an ironclad way of avoiding browsers saving likes 2x, but last_updated is not a
      // consensus variable and if they're loading tweets from server-archives uncritically it is a
      // sensible set of defaults.
      //
      await this.app.storage.loadTransactions(
        { sig: txmsg.data.signature, field1: 'RedSquare' },
        async (txs) => {
          if (txs?.length > 0) {
            // Keep this in our memory...
            this.addTweet(
              txs[0],
              { type: 'on_chain_like', node: 'localhost' },
              Math.max(0, this.curate(tx))
            );

            let tweet = this.returnTweet(txs[0].signature);
            if (tweet) {
              await this.updateTweetStat(tweet.tx, tx.timestamp, 'num_likes', tweet);
            }
          }
        },
        'localhost'
      );
    }

    //
    // Save locally -- indexed to myKey so it is accessible as a notification
    //
    // I'm not sure we really want to save these like this... but it may work out for profile views...
    //
    await this.app.storage.saveTransaction(tx, { field1: 'RedSquareLike' }, 'localhost', blk);

    return;
  }

  async sendRetweetTransaction(app, mod, data, tx) {
    let redsquare_self = this;

    let obj = {
      module: redsquare_self.name,
      request: 'retweet',
      data: {}
    };
    for (let key in data) {
      obj.data[key] = data[key];
    }

    let newtx = await redsquare_self.app.wallet.createUnsignedTransaction(tx.from[0]?.publicKey);

    //
    // All tweets include the sender in the to, but add the from first so they are in first position
    //
    for (let i = 0; i < tx.to.length; i++) {
      if (tx.to[i].publicKey !== this.publicKey) {
        newtx.addTo(tx.to[i].publicKey);
      }
    }

    newtx.msg = obj;
    await newtx.sign();
    await redsquare_self.app.network.propagateTransaction(newtx);

    return newtx;
  }

  async incrementRetweets(localTx, receivedTx) {
    if (!localTx.optional) {
      localTx.optional = {};
    }

    if (!localTx.optional.num_retweets) {
      localTx.optional.num_retweets = 0;
    }
    if (!localTx.optional.retweeters) {
      localTx.optional.retweeters = [];
    }

    console.log(localTx.updated_at, localTx.timestamp);
    let localTx_updated_at = localTx.updated_at || localTx.timestamp;

    if (receivedTx.timestamp > localTx_updated_at) {
      localTx.optional.num_retweets++;

      if (!localTx.optional.retweeters.includes(receivedTx.from[0].publicKey)) {
        localTx.optional.retweeters.unshift(receivedTx.from[0].publicKey);
      }

      localTx.optional.retweeted_at = receivedTx.timestamp;

      await this.app.storage.updateTransaction(
        localTx,
        { timestamp: receivedTx.timestamp },
        'localhost'
      );
    } else {
      console.warn(
        'RS.incrementRetweets: transaction received after archive load',
        localTx,
        receivedTx
      );
    }
  }

  async receiveRetweetTransaction(blk, tx, conf, app) {
    let txmsg = tx.returnMessage();

    let retweeted_tweet = this.returnTweet(txmsg.data.signature);

    //
    // save optional likes
    //

    if (retweeted_tweet?.tx) {
      await this.incrementRetweets(retweeted_tweet.tx, tx);

      //
      // set as curated if liked by moderator
      //
      this.updateTweetCuration(retweeted_tweet, tx);

      retweeted_tweet.rerenderControls(true);
    } else {
      //
      // fetch original to update
      //
      await this.app.storage.loadTransactions(
        { sig: txmsg.data.signature, field1: 'RedSquare' },
        async (txs) => {
          if (txs?.length > 0) {
            this.incrementRetweets(txs[0], tx);
          } else {
            console.warn('RS.receiveRetweet: Original tweet not found');
          }
        },
        'localhost'
      );
    }

    return;
  }

  async sendEditTransaction(app, mod, data, keys = []) {
    let redsquare_self = this;

    let obj = {
      module: redsquare_self.name,
      request: 'edit tweet',
      data: {}
    };
    for (let key in data) {
      obj.data[key] = data[key];
    }

    let newtx = await redsquare_self.app.wallet.createUnsignedTransaction();
    newtx.msg = obj;

    for (let i = 0; i < keys.length; i++) {
      newtx.addTo(keys[i]);
    }

    await newtx.sign();
    await redsquare_self.app.network.propagateTransaction(newtx);

    return newtx;
  }

  async sendDeleteTransaction(app, mod, data, keys = []) {
    let redsquare_self = this;

    let obj = {
      module: redsquare_self.name,
      request: 'delete tweet',
      data: {}
    };
    for (let key in data) {
      obj.data[key] = data[key];
    }

    let newtx = await redsquare_self.app.wallet.createUnsignedTransaction();
    newtx.msg = obj;

    for (let i = 0; i < keys.length; i++) {
      newtx.addTo(keys[i]);
    }

    await newtx.sign();
    await redsquare_self.app.network.propagateTransaction(newtx);

    return newtx;
  }

  async sendTweetTransaction(app, mod, data, keys = []) {
    let redsquare_self = this;

    let obj = {
      module: redsquare_self.name,
      request: 'create tweet',
      data: {}
    };
    for (let key in data) {
      obj.data[key] = data[key];
    }

    //let wallet_balance = await this.app.wallet.getBalance('SAITO');

    //let amount_to_send = /*wallet_balance > 1 ? BigInt(1) :*/ BigInt(0);

    let newtx = await redsquare_self.app.wallet.createUnsignedTransaction();

    newtx.msg = obj;

    for (let i = 0; i < keys.length; i++) {
      if (keys[i] !== this.publicKey) {
        newtx.addTo(keys[i]);
      }
    }

    await newtx.sign();
    await redsquare_self.app.network.propagateTransaction(newtx);

    return newtx;
  }

  editTweet(tweet_id, tx, source) {
    let edited_tweet = this.returnTweet(tweet_id);

    if (edited_tweet) {
      let orig_tx = edited_tweet.tx;
      if (!orig_tx.optional) {
        orig_tx.optional = {};
      }

      // What if there are multiple edits?
      if (tx.timestamp > (orig_tx.optional?.edit_ts || 0)) {
        orig_tx.optional.update_tx = tx.serialize_to_web(this.app);

        // To-Do -- shouldn't we replace the tweet?
        let new_tweet = new Tweet(this.app, this, orig_tx, edited_tweet.container);

        //
        // Information on the edit becomes part of the source history...
        //
        new_tweet.sources.push(source);
        new_tweet.rerenderControls(true);
      }
    } else {
      this.orphan_edits.push({ tweet_id, tx, source });
    }
  }

  async receiveEditTransaction(blk, tx, conf, app) {
    let txmsg = tx.returnMessage();

    if (!txmsg.data?.tweet_id) {
      console.warn('RS.receiveEdit: no tweet id to edit');
      return;
    }

    console.info('RS.receiveEdit: transaction received');

    if (this.browser_active) {
      this.editTweet(txmsg.data.tweet_id, tx, `onchain-edit-${tx.from[0].publicKey}`);
    }

    await this.app.storage.loadTransactions(
      { sig: txmsg.data.tweet_id, field1: 'RedSquare' },
      async (txs) => {
        if (txs?.length) {
          //
          // only update first copy??
          //
          let oldtx = txs[0];
          //
          // save the tx
          //
          if (oldtx.from[0].publicKey === tx.from[0].publicKey) {
            if (!oldtx.optional) {
              oldtx.optional = {};
            }

            if (tx.timestamp > (oldtx.optional?.edit_ts || 0)) {
              oldtx.optional.update_tx = tx.serialize_to_web(this.app);
              oldtx.optional.edit_ts = tx.timestamp;
            }

            await this.app.storage.updateTransaction(
              oldtx,
              { timestamp: tx.timestamp },
              'localhost'
            );
          }
        }
      },
      'localhost'
    );
  }

  //
  // We should remove the tweet in question from memory (if we have it)
  // remove it from the archives and update the archives of linked tweets so that the stats
  // decrement accordingly
  // To-do: implement live updating of reply/retweet counts (currently requires a refresh)
  //
  async receiveDeleteTransaction(blk, tx, conf, app) {
    console.info('RS.receiveDelete: transaction received');

    let txmsg = tx.returnMessage();

    if (!txmsg.data) {
      return;
    }
    if (!txmsg.data.tweet_id) {
      return;
    }

    this.removeTweet(txmsg.data.tweet_id);

    await this.app.storage.loadTransactions(
      { sig: txmsg.data.tweet_id },
      async (txs) => {
        if (txs?.length) {
          //
          // only update first copy??
          //
          let oldtx = txs[0];

          //
          // save the tx
          //
          if (oldtx.from[0].publicKey === tx.from[0].publicKey) {
            await this.app.storage.deleteTransaction(oldtx, {}, 'localhost');

            let tweet = new Tweet(this.app, this, oldtx, '');

            // Delete tweet is a reply
            if (tweet.tx.optional.parent_id) {
              await this.app.storage.loadTransactions(
                { sig: tweet.tx.optional.parent_id, field1: 'RedSquare' },
                async (txs) => {
                  if (txs?.length) {
                    if (txs[0]?.optional?.num_replies) {
                      txs[0].optional.num_replies--;
                      await this.app.storage.updateTransaction(
                        txs[0],
                        { timestamp: tx.timestamp },
                        'localhost'
                      );
                    }
                  }
                },
                'localhost'
              );
            }

            // Deleted tweet is a retweet
            if (tweet.retweet_tx) {
              await this.app.storage.loadTransactions(
                { sig: tweet.retweet.tx.signature, field1: 'RedSquare' },
                async (txs) => {
                  if (txs?.length) {
                    if (txs[0].optional?.num_retweets) {
                      txs[0].optional.num_retweets--;
                      await this.app.storage.updateTransaction(
                        txs[0],
                        { timestamp: tx.timestamp },
                        'localhost'
                      );
                    }
                  }
                },
                'localhost'
              );
            }
          }
        }
      },
      'localhost'
    );

    //Save the transaction with command to delete
    if (!app.BROWSER) {
      await this.app.storage.saveTransaction(tx, { field1: 'RedSquare' }, 'localhost', blk);
    }
  }

  async receiveTweetTransaction(blk, tx, conf, app) {
    console.info('RS.receiveTweet: transaction received');

    try {
      let tweet = new Tweet(app, this, tx);
      let other_tweet = null;
      let txmsg = tx.returnMessage();

      //
      // save this transaction in our archives as a redsquare transaction that is owned by ME (the server), so that I
      // can deliver it to users who want to fetch RedSquare transactions from the archives instead of just through the
      // sql database -- this is done by specifying that I -- "localhost" am the peer required.
      //

      //
      // servers -- get open graph properties
      //
      tweet = await tweet.analyseTweetLinks(1);

      this.saveTweet(tweet, 1, blk);

      //
      // Includes retweeted tweet
      //
      if (tweet.retweet_tx != null) {
        other_tweet = this.returnTweet(tweet.signature);

        if (other_tweet) {
          await this.incrementRetweets(other_tweet.tx, tx);
          this.updateTweetCuration(other_tweet, tx);
          other_tweet.rerenderControls();
        } else {
          //
          // fetch archived copy
          //
          // servers load from themselves
          //
          await this.app.storage.loadTransactions(
            { sig: tweet.signature, field1: 'RedSquare' },
            async (txs) => {
              if (txs?.length) {
                this.incrementRetweets(txs[0], tx);
              }
            },
            'localhost'
          );
        }
      }

      //
      // Is a reply
      //
      if (tweet.parent_id && tweet.parent_id !== tweet.tx.signature) {
        //
        // if we have the parent tweet in memory...
        //
        other_tweet = this.returnTweet(tweet.parent_id);

        if (other_tweet) {
          await this.updateTweetStat(other_tweet.tx, tx.timestamp, 'num_replies', other_tweet);
          other_tweet.rerenderControls();
        } else {
          //
          // ...otherwise, hit up the archive first
          //
          await this.app.storage.loadTransactions(
            { sig: tweet.parent_id, field1: 'RedSquare' },
            async (txs) => {
              if (txs?.length) {
                await this.updateTweetStat(txs[0], tx.timestamp, 'num_replies');
              }
            },
            'localhost'
          );
        }
      }

      //
      // prune if too many tweets
      //
      //if (this.tweets.length > 100) {
      //  this.pruneTweets();
      //}
    } catch (err) {
      console.error('RS.receiveTweetsTransaction ERROR: ', err);
    }
  }

  //
  // How does this work with the archive module???
  //
  async sendFlagTransaction(app, mod, data, tx) {
    let redsquare_self = this;

    let obj = {
      module: redsquare_self.name,
      request: 'flag tweet',
      data: {}
    };

    //
    // data = {signature : tx.signature }
    //
    for (let key in data) {
      obj.data[key] = data[key];
    }

    let newtx = await redsquare_self.app.wallet.createUnsignedTransaction();

    newtx.msg = obj;
    await newtx.sign();
    await redsquare_self.app.network.propagateTransaction(newtx);

    return newtx;
  }

  //
  // We have a lot of work to do here....
  // ...an interface for users to delete their own tweets
  // ...an interface for moderators to review tweets
  //
  async receiveFlagTransaction(blk, tx, conf, app) {
    let txmsg = tx.returnMessage();

    let flagged_tweet = this.returnTweet(txmsg.data.signature);

    let process_action = tx.isFrom(this.publicKey);

    let modScore = this.app.modules.moderate(tx);

    if (modScore == -1) {
      // Ignore blacklisted people
      return;
    } else if (modScore == 1) {
      // Trusted moderator
      process_action = true;
    }

    if (flagged_tweet) {
      // two people who are not moderators have flagged it
      if (flagged_tweet.flagged) {
        process_action = true;
      } else {
        // add a note that this was flagged, but don't necessarily update the database
        flagged_tweet.flagged = true;
      }

      //Move off curation list
      flagged_tweet.curated = -1;
      flagged_tweet.optional.curated = -1;
      this.cacheRecentTweets(true);
    }

    //
    // we will "soft delete" the tweet for the person who flagged it and in the central archives
    //
    if (process_action) {
      if (flagged_tweet?.tx) {
        await this.app.storage.updateTransaction(
          flagged_tweet.tx,
          { timestamp: tx.timestamp, flagged: 1 },
          'localhost'
        );
      } else {
        await this.app.storage.loadTransactions(
          { sig: txmsg.data.signature, field1: 'RedSquare' },
          async (txs) => {
            if (txs?.length > 0) {
              let archived_tx = txs[0];

              archived_tx.optional.curated = -1;

              await this.app.storage.updateTransaction(
                archived_tx,
                { timestamp: tx.timestamp, flagged: 1 },
                'localhost'
              );
            }
          },
          'localhost'
        );
      }
    }

    //
    // let both users know that something happened
    //
    if (app.BROWSER == 1) {
      if (tx.isTo(this.publicKey)) {
        if (tx.isFrom(this.publicKey)) {
          siteMessage('Tweet successfully flagged for review', 3000);
        } else {
          siteMessage('One of your tweets was flagged for review', 10000);
        }
      } else {
        console.info(
          `RS.receiveFlagTransaction: Your friend [${this.app.keychain.returnUsername(tx.from[0].publicKey)}] flagged a tweet -- `,
          flagged_tweet.text
        );
      }
    }

    return;
  }

  saveTweet(tweet, preserve = 1, blk = null) {
    if (!tweet) {
      console.warn('RS.saveTweet: no tweet!');
      return;
    }

    // If I save a tweet locally by interacting with it, mark it as curated for me
    if (preserve) {
      tweet.tx.optional.curated = 1;
    }

    //
    // this transaction is TO me, but I may not be the tx.to[0].publicKey address, and thus the archive
    // module may not index this transaction for me in a way that makes it very easy to fetch (field3 = MY_KEY}
    // thus we override the defaults by setting field3 explicitly to our publickey so that loading transactions
    // from archives by fetching on field3 will get this.
    //
    let opt = {
      field1: 'RedSquare', //defaults to module.name, but just to make sure we match the capitalization with our loadTweets
      preserve,
      field4: tweet.parent_id || '',
      field5: tweet.thread_id || ''
    };

    if (tweet.rethread) {
      opt.field4 = 'special';
    }

    if (tweet.tx.isTo(this.publicKey)) {
      //
      // When a browser stores tweets, it is storing tweets it sent or were sent to it
      // this will help use with notifications (to) and profile (from)
      //
      opt['field3'] = this.publicKey;
    }

    //
    // Save the modified tx so we have open graph properties available
    //

    this.app.storage.loadTransactions(
      { field1: 'RedSquare', sig: tweet.tx.signature },
      (txs) => {
        if (txs?.length > 0) {
          this.app.storage.updateTransaction(tweet.tx, opt, 'localhost');
        } else {
          this.app.storage.saveTransaction(tweet.tx, opt, 'localhost', blk);
        }
      },
      'localhost'
    );
  }

  updateSavedTweet(sig) {
    let tweet = this.returnTweet(sig);

    if (!tweet) {
      console.warn('RS.updateTweet: tweet not found!', sig);
      return;
    }

    this.app.storage.updateTransaction(tweet.tx, {}, 'localhost');
  }

  /////////////////////////////////////
  // saving and loading wallet state //
  /////////////////////////////////////
  loadOptions() {
    if (!this.app.BROWSER) {
      return;
    }

    if (this.app.options.redsquare) {
      const rso = this.app.options.redsquare;

      this.notifications_last_viewed_ts = rso?.notifications_last_viewed_ts || 0;
      this.notifications_number_unviewed = rso?.notifications_number_unviewed || 0;
      this.tweet_count = rso?.tweet_count || 0;

      this.liked_tweets = rso?.liked_tweets || [];
      this.retweeted_tweets = rso?.retweeted_tweets || [];
      this.replied_tweets = rso?.replied_tweets || [];
      this.hidden_tweets = rso?.hidden_tweets || [];

      if (rso?.curated == 0) {
        this.curated = false;
      }
    }

    this.saveOptions();
  }

  saveOptions() {
    if (!this.app.BROWSER) {
      return;
    }

    let rso = {};

    rso.notifications_last_viewed_ts = this.notifications_last_viewed_ts;
    rso.notifications_number_unviewed = this.notifications_number_unviewed;
    rso.tweet_count = this.tweet_count;

    rso.liked_tweets = this.liked_tweets.slice(-100);
    rso.retweeted_tweets = this.retweeted_tweets.slice(-100);
    rso.replied_tweets = this.replied_tweets.slice(-100);
    rso.hidden_tweets = this.hidden_tweets;

    rso.curated = this.curated;

    this.app.options.redsquare = rso;

    this.app.storage.saveOptions();
  }

  //////////////
  // remember //
  //////////////
  likeTweet(tweet) {
    if (!tweet?.tx?.signature) {
      return;
    }
    if (!this.liked_tweets.includes(tweet.tx.signature)) {
      this.liked_tweets.push(tweet.tx.signature);
      this.saveTweet(tweet);
    }
    this.saveOptions();
  }

  retweetTweet(tweet) {
    if (!tweet?.tx?.signature) {
      return;
    }
    if (!this.retweeted_tweets.includes(tweet.tx.signature)) {
      this.retweeted_tweets.push(tweet.tx.signature);
      this.saveTweet(tweet);
    }
    this.saveOptions();
  }

  replyTweet(tweet) {
    if (!tweet?.tx?.signature) {
      return;
    }
    if (!this.replied_tweets.includes(tweet.tx.signature)) {
      this.replied_tweets.push(tweet.tx.signature);
      this.saveTweet(tweet);
    }
    this.saveOptions();
  }

  cacheRecentTweets(force_caching = false) {
    if (this.app.BROWSER) {
      return;
    }

    let ts = new Date().getTime();
    if (!force_caching && this.last_cache + 300000 > ts) {
      /*console.debug(
        '###\n### RS.cacheRecentTweets -- too soon to recalculate! \n###\n###',
        this.cached_tweets.length
      );*/
      return;
    }

    this.last_cache = ts;

    this.cached_tweets = [];

    for (let tweet of this.tweets) {
      //
      // Update curation (because we maybe have more named keys)
      //
      tweet.curated = this.curate(tweet.tx);

      if (tweet.curated == 1) {
        tweet.tx.optional.curated = 1;
        this.cached_tweets.push(tweet.tx.serialize_to_web(this.app));
      }
    }

    if (this.debug) {
      console.debug(
        `###\n### RS.cacheRecentTweets -- Tweets: ${this.tweets.length} Cached: ${this.cached_tweets.length} \n###`
      );
    }

    // Keep at most 9 curated tweets
    this.cached_tweets = this.cached_tweets.slice(0, 9);

    let test_tweet = true;

    // Add at least 1 non-curated tweets
    if (this.cached_tweets.length < 10) {
      for (let z = 0; z < this.tweets.length && this.cached_tweets.length < 10; z++) {
        if (this.tweets[z].curated == 0) {
          if (test_tweet) {
            //
            // We add the most recent 'curated = 0' tweet as a test tweet
            //
            test_tweet = false;
            this.tweets[z].tx.optional.curated = 0;
            this.tweets[z].tx.optional.curation_check = true;
            this.cached_tweets.push(this.tweets[z].tx.serialize_to_web(this.app));
          } else {
            //
            // For the fallback, let's keep some automated standards to pull out better content
            // Theoretically, we should only have a problem the first time this code is deployed
            // afterwards we will have seeded enough whitelisted keys and positively curated tweets
            // that repeated deployments will pick up the vetted content
            //
            let score = Math.log(this.tweets[z].num_likes + 1);
            score += this.tweets[z].num_retweets;
            score += Math.log(this.tweets[z].num_replies + 1) / Math.log(2);
            if (this.tweets[z].images?.length) {
              score += 3 * this.tweets[z].images.length;
            }
            if (score > 10) {
              this.tweets[z].tx.optional.curated = 0;
              this.cached_tweets.push(this.tweets[z].tx.serialize_to_web(this.app));
            }
          }
        }
      }
    }
  }

  fetchMissingUsernames(mycallback = null) {
    let keylist = [];

    for (let i = 0; i < this.tweets.length; i++) {
      if (!keylist.includes(this.tweets[i].tx.from[0].publicKey)) {
        keylist.push(this.tweets[i].tx.from[0].publicKey);
      }
    }

    let rMod = this.app.modules.returnModule('Registry');
    if (rMod) {
      rMod.fetchManyIdentifiers(keylist, (answer) => {
        if (mycallback != null) {
          mycallback(answer);
        }
      });
    } else {
      console.warn('No Registry');
    }
  }

  /******************************
   * Make RedSquare Curation Settings
   * visibile outside of RS
   *****************************/
  hasSettings() {
    return true;
  }

  loadSettings(container = null) {
    if (!container) {
      let overlay = new SaitoOverlay(this.app, this.mod);
      overlay.show(`<div class="module-settings-overlay"><h2>Redsquare Settings</h2></div>`);
      container = '.module-settings-overlay';
    }
    let as = new AppSettings(this.app, this, container);
    as.render();
  }

  ///////////////
  // webserver //
  ///////////////
  webServer(app, expressapp, express) {
    let webdir = `${__dirname}/../../mods/${this.dirname}/web`;
    let redsquare_self = this;

    expressapp.get('/' + encodeURI(this.returnSlug()), async function (req, res) {
      let reqBaseURL = req.protocol + '://' + req.headers.host + '/';

      try {
        if (Object.keys(req.query).length > 0) {
          let query_params = req.query;

          let sig = query_params?.tweet_id || query_params?.thread_id;

          if (sig) {
            redsquare_self.loadTweetWithSig(sig, (txs) => {
              let updated_social = redsquare_self.social;
              //>>>>>>>>>>>>>>
              for (let z = 0; z < txs.length; z++) {
                let tx = txs[z];

                let txmsg = tx.returnMessage();
                let text = txmsg.data.text;
                let publicKey = tx.from[0].publicKey;
                let user = app.keychain.returnUsername(publicKey);

                //
                // We need adequate protection here
                //
                let url = reqBaseURL + encodeURI(redsquare_self.returnSlug());
                let image = url + '?og_img_sig=' + sig;

                updated_social = {
                  twitter: '@SaitoOfficial',
                  title: user + ' posted on Saito 🟥',
                  url: url,
                  description: app.browser.escapeHTML(text),
                  image: image
                };

                txs[z] = txs[z].serialize_to_web(app);
              }

              let html = redsquareHome(app, redsquare_self, app.build_number, updated_social, txs);
              if (!res.finished) {
                res.setHeader('Content-type', 'text/html');
                res.charset = 'UTF-8';
                return res.send(html);
              }
            });

            return;
          }

          if (typeof query_params.og_img_sig != 'undefined') {
            let sig = query_params.og_img_sig;

            redsquare_self.loadTweetWithSig(sig, (txs) => {
              for (let i = 0; i < txs.length; i++) {
                let tx = txs[i];
                let txmsg = tx.returnMessage();
                let img = '';
                let img_type;

                if (txmsg.data?.images?.length > 0) {
                  let img_uri = txmsg.data.images[0];
                  img_type = img_uri.substring(img_uri.indexOf(':') + 1, img_uri.indexOf(';'));
                  let base64Data = img_uri.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
                  img = Buffer.from(base64Data, 'base64');
                } else {
                  let publicKey = tx.from[0].publicKey;
                  let img_uri = app.keychain.returnIdenticon(publicKey, 'png');
                  let base64Data = img_uri.replace(/^data:image\/png;base64,/, '');
                  img = Buffer.from(base64Data, 'base64');
                  img_type = img_uri.substring(img_uri.indexOf(':') + 1, img_uri.indexOf(';'));
                }

                if (img_type == 'image/svg+xml') {
                  img_type = 'image/svg';
                }

                if (!res.finished) {
                  res.writeHead(200, {
                    'Content-Type': img_type,
                    'Content-Length': img.length
                  });
                  return res.end(img);
                }
              }
            });

            return;
          }
        }
      } catch (err) {
        console.error('RS.webServer: Loading OG data failed with error: ', err);
      }

      redsquare_self.cacheRecentTweets();

      if (!res.finished) {
        let html = redsquareHome(
          app,
          redsquare_self,
          app.build_number,
          redsquare_self.social,
          redsquare_self.cached_tweets
        );
        res.setHeader('Content-type', 'text/html');
        res.charset = 'UTF-8';
        return res.send(html);
      }
      return;
    });

    expressapp.use('/' + encodeURI(this.returnSlug()), express.static(webdir));
  }

  // This needs to be a separate function from basic moderation, because users
  // will want to toggle it on/off, but moderation happens at the core and blocks
  // even receiving transactions
  curate(tx) {
    // MODERATE first
    // accept black and white lists as authoritative before defaulting to tweet analysis
    //

    let moderation_score = this.app.modules.moderate(tx, this.name);

    if (moderation_score == 1) {
      return 1;
    }
    if (moderation_score == -1) {
      return -1;
    }

    // My contacts get through
    if (this.app.keychain.hasPublicKey(tx.from[0].publicKey)) {
      return 1;
    }

    if (tx.to[0].amount) {
      //console.log('Auto approve moneyed tweets: ', tx.to[0].amount);
      return 1;
    }

    // Allow us to cache curated status (preferably just "1") in local archives
    if (tx.optional.curated !== undefined) {
      return tx.optional.curated;
    }

    return 0;
  }
}

module.exports = RedSquare;
