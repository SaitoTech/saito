const RedSquareMainTemplate = require('./main.template');
const Tweet = require('./tweet');
const Post = require('./post');
const Notification = require('./notification');
const SaitoProfile = require('./../../../lib/saito/ui/saito-profile/saito-profile');
const SaitoLoader = require('./../../../lib/saito/ui/saito-loader/saito-loader');

//
// RedSquare Main
//
//
class RedSquareMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.name = 'RedSquareMain';
    this.mode = 'welcome';

    this.components = {};

    this.scroll_depth = 0;

    this.profile_tweets = {};
    this.profile = new SaitoProfile(app, mod, '.saito-main');
    this.profile.tab_container = '.tweet-container';
    this.profile_tabs = ['posts', 'replies', /*'retweets',*/ 'likes'];
    this.profile.reset(this.mod.publicKey, 'posts', this.profile_tabs);

    //This is an in-place loader... not super useful when content is overflowing off the bottom of the screen
    this.loader = new SaitoLoader(app, mod, '#redsquare-intersection');

    ///////////////////
    // RENDER EVENTS //
    ///////////////////
    //
    // lib/main.js:    this.app.connection.on("redsquare-home-render-request", () => {          // renders main tweets
    // lib/main.js:    this.app.connection.on("redsquare-home-postcache-render-request", () => {        // pushes new content into feed if possible
    // lib/main.js:    this.app.connection.on("redsquare-tweet-render-request", (tweet) => {      // renders tweet onto page, at bottom
    // lib/main.js:    this.app.connection.on("redsquare-profile-render-request", () => {         // renders profile
    // lib/main.js:    this.app.connection.on("redsquare-notifications-render-request", () => {     // renders notifications
    // lib/main.js:    app.connection.on('redsquare-render-new-post', ()=> // insert a newly posted tweet in the feed
    //

    app.connection.on('redsquare-render-new-post', (tweettx, rparent = null) => {
      if (!this.mode.includes('tweet')) {
        return;
      }

      let posted_tweet = new Tweet(this.app, this.mod, tweettx, '.tweet-container');

      if (rparent) {
        if (posted_tweet.retweet_tx) {
          rparent.render();
          this.mod.addTweet(tweettx, { type: 'retweet', node: 'user post' });
          posted_tweet.render(true);
        } else {
          this.mod.addTweet(tweettx, { type: 'reply', node: 'user post' });
          if (rparent.parent_id != '') {
            let t = this.mod.returnTweet(rparent.parent_id);
            if (t) {
              t.critical_child = posted_tweet;
            }
          }

          rparent.critical_child = posted_tweet;
          rparent.forceRenderWithCriticalChild();
        }
      } else {
        this.mod.addTweet(tweettx, { type: 'new tweet', node: 'user post' });
        posted_tweet.render(true);
      }
    });

    app.connection.on('redsquare-home-render-request', (scroll_to_top = false) => {
      console.debug('RS.redsquare-home-render-request', scroll_to_top);

      let behavior = scroll_to_top ? 'smooth' : 'auto';

      if (scroll_to_top) {
        this.scroll_depth = 0;
        window.history.replaceState({}, null, '/' + this.mod.slug);
      } else {
        window.history.pushState({}, null, '/' + this.mod.slug);
      }

      if (this.mod.out_of_order) {
        console.info('RS.home-render-request have new tweets the fold into feed, rerender!');
        this.clearFeed();
      }
      this.render();
    });

    //
    // render main (subsequent loads)
    //
    app.connection.on('redsquare-home-postcache-render-request', (num_tweets = 0) => {
      if (num_tweets > 0 && this.mode === 'tweets') {
        let are_there_new_tweets_to_show = false;
        for (let i = 0; i < this.mod.tweets.length && i < 10; i++) {
          if (!this.mod.tweets[i].isRendered()) {
            if (!this.mod.curated || this.mod.tweets[i].curated) {
              are_there_new_tweets_to_show = true;
            }
          }
        }

        if (!are_there_new_tweets_to_show) {
          return;
        }

        if (this.mod.out_of_order) {
          this.hideLoader();

          if (!document.getElementById('saito-load-new-tweets')) {
            this.app.browser.prependElementToSelector(
              `<div class="saito-button-secondary saito-load-new-tweets" id="saito-load-new-tweets">load new tweets</div>`,
              '.redsquare-load-new-tweets-container'
            );
          }
          document.getElementById('saito-load-new-tweets').onclick = (e) => {
            this.scrollFeed(0, 'smooth');
            e.currentTarget.remove();
            this.clearFeed();
            this.render();
            this.mod.out_of_order = false;
          };
        } else {
          this.render();
        }
        this.mod.tweets_earliest_ts--;
      }
    });

    //
    // tweet
    //
    app.connection.on('redsquare-tweet-render-request', (tweet) => {
      if (this.mode == 'tweet') {
        window.history.replaceState(
          {
            view: 'tweet',
            tweet: tweet.thread_id
          },
          null,
          '/' + this.mod.slug + `/?tweet_id=${tweet.tx.signature}`
        );
      } else {
        window.history.pushState(
          {
            view: 'tweet',
            tweet: tweet.thread_id
          },
          null,
          '/' + this.mod.slug + `/?tweet_id=${tweet.tx.signature}`
        );
      }

      this.render();
    });

    //
    // notifications
    //
    app.connection.on('redsquare-notifications-render-request', () => {
      window.history.pushState(
        {
          view: 'notifications',
          last_view: this.notifications_last_viewed_ts,
          unviewed_ct: this.mod.notifications_number_unviewed
        },
        null,
        '/' + this.mod.slug + '#notifications'
      );

      this.render();
    });

    //
    // profile
    //
    app.connection.on('redsquare-profile-render-request', (publicKey = '') => {
      if (!publicKey) {
        publicKey = this.mod.publicKey;
      }

      let target = publicKey == this.mod.publicKey ? '#profile' : `/?user_id=${publicKey}`;
      window.history.pushState({ view: 'profile', publicKey }, '', '/' + this.mod.slug + target);

      this.render();
    });

    //
    // blacklist
    //
    app.connection.on('saito-blacklist', (obj) => {
      let target_key = obj?.publicKey;
      if (!target_key) {
        return;
      }
      for (let tweet of this.mod.tweets) {
        if (tweet.tx.isFrom(target_key)) {
          tweet.hideTweet();
        }
      }
    });

    //////////////////////////////
    // load more on scroll-down //
    //////////////////////////////
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            document.getElementById('intersection-observer-trigger').classList.add('deactivated');
            this.intersectionObserver.disconnect();
            this.handleIntersection();
          }
        });
      },
      {
        root: null,
        threshold: 1
      }
    );

    //
    // INTERNAL NAVIGATION IN REDSQUARE
    //
    window.onpopstate = (event) => {
      if (this.mod.debug) {
        console.info(
          '===================',
          'RS.NAV[onpopstate]: ',
          event?.state,
          window.location,
          '========================'
        );
      }

      this.render(event.state);
    };
  }

  clearFeed() {
    document.getElementById('intersection-observer-trigger').classList.add('deactivated');
    this.intersectionObserver.disconnect();
    let holder = document.getElementById('tweet-thread-holder');
    let managerElem = document.querySelector('.tweet-container');
    if (holder) {
      while (holder.hasChildNodes()) {
        holder.firstChild.remove();
      }
    }
    if (managerElem) {
      while (managerElem.hasChildNodes()) {
        managerElem.firstChild.remove();
      }
    }
  }

  render() {
    let time = Date.now();

    if (!document.querySelector('.saito-container')) {
      this.app.browser.addElementToDom(RedSquareMainTemplate(this.mod));
    }

    let mainElem = document.querySelector('.tweet-container');
    let holderElem = document.querySelector('.tweet-thread-holder');

    if (!mainElem || !holderElem) {
      console.error('Error rendering RS Main');
      return;
    }

    this.attachEvents();

    mainElem.classList.remove('thread-view');

    //////////////////////
    // check url hash so we don't render conflicting things...
    //
    let new_mode = 'tweets';
    let user_id = this.app.browser.returnURLParameter('user_id');

    switch (window.location.hash) {
      case '#notifications':
        console.debug('RS.NAV: Render Notifications');
        new_mode = 'notifications';
        break;
      case '#profile':
        user_id = this.mod.publicKey;
        break;
      case '#bizarro':
        this.mod.bizarro = true;
      default:
    }

    //
    // render user profile
    //
    if (user_id) {
      new_mode = 'profile';
    }

    //
    // if view specific tweet, ask for tweet/children
    //
    let tweet_id = this.app.browser.returnURLParameter('tweet_id');
    if (tweet_id) {
      new_mode = 'tweet';
    }

    //
    // Keep sidebar highlight in sync with the current view
    //
    this.app.connection.emit('redsquare-clear-menu-highlighting', new_mode);

    //
    // turn off infinite scroll
    //
    document.getElementById('intersection-observer-trigger').classList.add('deactivated');
    this.intersectionObserver.disconnect();

    //
    // remove profile (if preesnt)
    //
    this.profile.remove();

    while (document.querySelector('.saito-end-of-redsquare')) {
      document.querySelector('.saito-end-of-redsquare').remove();
    }

    console.info('Render RS main for mode: ', new_mode, 'Current: ', this.mode);

    if (new_mode != this.mode) {
      // Return to curated view
      if (this.mod.curated) {
        document.querySelector('.tweet-container').classList.add('active-curation');
        if (document.querySelector('.show-more-button')) {
          document.querySelector('.show-more-button').remove();
        }
      }
    }

    try {
      document.querySelector('.saito-main').dataset.view = new_mode;
    } catch (err) {}

    //
    // return to / display main feed
    //
    if (new_mode === 'tweets') {
      if (this.mode !== 'tweets') {
        mainElem.replaceChildren(...holderElem.children);
      }

      for (let tweet of this.mod.tweets) {
        if (!tweet.isRendered()) {
          tweet.renderWithCriticalChild();
        }
      }

      this.scrollFeed(this.scroll_depth, this.scroll_depth == 0 ? 'smooth' : 'auto');
      this.app.connection.emit('saito-header-reset-logo');
      this.mod.out_of_order = false;

      if (this.mode !== 'welcome') {
        this.enableObserver();
      }
      this.mode = new_mode;

      if (this.mod.debug) {
        console.debug(`RS.render: ${Date.now() - time}ms elapsed in rendering main feed`);
      }
      return;
    }

    this.scrollFeed(0);

    //
    // backup tweets into hidden div before nevigating away from main thread
    // (this is to speed up navigation by keeping downloaded images in the browser)
    //
    if (this.mode === 'tweets') {
      holderElem.replaceChildren(...mainElem.children);
    }

    //
    // otherwise clear out any profile/notification list tweets
    //
    while (mainElem.hasChildNodes()) {
      mainElem.firstChild.remove();
    }

    // set back arrow
    if (window.history.state) {
      this.app.connection.emit('saito-header-replace-logo', () => {
        window.history.back();
      });
    } else {
      console.log('Rendering RS page direct from url');
      this.app.connection.emit('saito-header-replace-logo', () => {
        this.app.connection.emit('redsquare-home-render-request');
      });
    }
    //

    if (!this.mod.archive_connected) {
      console.warn('RS.Need to wait for archive so we can get stuff for RedSquare');
      return;
    }

    this.mode = new_mode;

    //
    // render notification
    //
    if (new_mode === 'notifications') {
      console.log('RS-main.render -- notifications: ', this.mod.notifications.length);
      if (this.mod.notifications.length > 0) {
        for (let i = 0; i < this.mod.notifications.length; i++) {
          let notification = new Notification(this.app, this.mod, this.mod.notifications[i]);
          notification.render('.tweet-container');
        }
      }
      this.mod.resetNotifications();
      this.moreNotifications();
      //this.enableObserver();

      console.debug(`RS.render: ${Date.now() - time}ms elapsed in rendering notifications`);

      return;
    }

    //
    // render tweet (thread)
    //
    if (new_mode === 'tweet') {
      mainElem.classList.add('thread-view');
      let tweet = this.mod.returnTweet(tweet_id);
      if (tweet) {
        this.renderTweet(tweet);
      } else {
        this.showLoader();

        console.debug('Resort to callback for tweet thread...');
        ///>>>>>>> We should load the whole thread here...
        this.mod.loadTweetThread(tweet_id, (txs) => {
          this.hideLoader();
          console.debug(`RS.NAV: Tweet thread load returned ${txs.length} tweets`);
          let tweet = this.mod.returnTweet(tweet_id);
          this.renderTweet(tweet);
        });
      }
    }

    //
    // render profile
    //
    if (new_mode === 'profile') {
      //
      // There is no point viewing someone's profile and applying curation filtering...
      //
      if (document.querySelector('.active-curation')) {
        document.querySelector('.active-curation').classList.remove('active-curation');
      }

      if (user_id != this.profile.publicKey) {
        this.profile_tweets[this.profile.publicKey] = this.profile.menu;
        this.profile.reset(user_id, 'posts', this.profile_tabs);

        for (let peer of this.mod.peers) {
          peer.profile_ts = new Date().getTime();
        }
      }

      this.loader.show();

      if (this.profile_tweets[user_id]) {
        this.profile.menu = this.profile_tweets[user_id];
      }

      this.profile.render();

      this.loadProfile();
    }

    console.debug(`RS.render: ${Date.now() - time}ms elapsed in rendering`);
  }

  moreNotifications() {
    this.showLoader();

    this.mod.loadNotifications((new_txs) => {
      if (this.mode !== 'notifications') {
        return;
      }

      for (let i = 0; i < new_txs.length; i++) {
        let notification = new Notification(this.app, this.mod, new_txs[i]);
        notification.render('.tweet-container');
      }

      if (new_txs.length == 0) {
        if (this.mod.notifications.length == 0) {
          //Dummy "Notification" for end of history sign
          let notification = new Notification(this.app, this.mod, null);
          notification.render('.tweet-container');
        }

        setTimeout(() => {
          this.hideLoader();
        }, 50);
      } else {
        this.enableObserver();
      }
    });
  }

  /**
   *  I know how many tx this peer returned,
   *  whether there are 0, 1, or more active peers,
   *  and the earliest tweet time stamps (system and this peer)
   */
  insertOlderTweets(tx_count, peer = null) {
    console.debug(
      'Infinite Scroll callback: ',
      peer.publicKey.substring(0, 10),
      tx_count,
      this.numActivePeers,
      this.mod.tweets_earliest_ts
    );

    if (this.mode !== 'tweets') {
      return;
    }

    // Render
    for (let tweet of this.mod.tweets) {
      if (!tweet.isRendered()) {
        tweet.renderWithCriticalChild();
      }
    }

    this.numActivePeers--;
    if (this.numActivePeers <= 0) {
      console.debug('RS.insertOlderTweets -- all active peers returned: ', tx_count);
      this.enableObserver();
    } else {
      console.debug('RS.insertOlderTweets -- still waiting on a peer to return');
    }
  }

  //
  // fetch profile tweets as needed
  //
  async loadProfile() {
    const profile_id = this.profile.publicKey;

    if (this.mod.publicKey == profile_id) {
      console.debug('RS.Profile -- use list of liked tweets');
      // Find likes...
      // I already have a list of tweets I liked available
      this.loadProfileLikes(this.mod.liked_tweets, 'localhost');
    }

    let np = this.mod.peers.length;
    if (np > 1) {
      siteMessage(`Checking with ${np} peers for profile tweets...`, 1000);
    } else {
      this.showLoader();
    }

    for (let peer of this.mod.peers) {
      if (this.mod.publicKey !== profile_id && peer.peer !== 'localhost') {
        console.debug('RS.Profile -- query peer for likes ', peer.publicKey.substring(0, 10));
        this.app.storage.loadTransactions(
          { field1: 'RedSquareLike', field2: profile_id, limit: 100 },
          (txs) => {
            let liked_tweets = [];
            for (tx of txs) {
              let txmsg = tx.returnMessage();

              let sig = txmsg?.data?.signature;
              if (sig && !liked_tweets.includes(sig)) {
                liked_tweets.push(sig);
              }
            }

            this.loadProfileLikes(liked_tweets, peer);
          },
          peer
        );
      }

      console.debug('RS.Profile -- query peer for tweets: ', peer.publicKey.substring(0, 10));
      this.app.storage.loadTransactions(
        {
          field1: 'RedSquare',
          field2: profile_id,
          limit: 100,
          created_earlier_than: peer.profile_ts
        },
        (txs) => {
          this.hideLoader();

          // Sort txs into posts/replies/retweets...
          this.filterProfileTweets(txs, profile_id);

          //
          // Don't use processTweetsFromPeer(peer, txs)
          // because it updates the global timestamps and caches tweets in our local storage
          //
          for (let z = 0; z < txs.length; z++) {
            txs[z].decryptMessage(this.app);
            //this.mod.addTweet(txs[z], {type: "profile", node: peer.publicKey});
            peer.profile_ts = txs[z]?.timestamp;
          }

          if (this.mode !== 'profile' || profile_id !== this.profile.publicKey) {
            console.warn(
              `Navigated away from profile before peer (${peer?.publicKey}) returned results...`
            );
            return;
          }

          console.debug(
            `RS.Profile -- rendering profile with results (${txs.length}) from peer (${peer.publicKey.substring(0, 10)})`
          );
          this.profile.render();

          if (txs.length == 100) {
            this.enableObserver();
          }

          if (peer.peer !== 'localhost') {
            siteMessage(
              `Processing response from ${this.app.keychain.returnUsername(peer.publicKey)}`,
              1000
            );
          }
          np--;
          setTimeout(() => {
            if (np > 0) {
              siteMessage(`Loading from ${np} peers...`, 1000);
            }
          }, 1500);
        },
        peer.peer
      );
    }
  }

  loadProfileLikes(list_of_liked_tweet_sigs, peer) {
    if (this.mode !== 'profile') {
      return;
    }

    for (let sig of list_of_liked_tweet_sigs) {
      //
      // We may already have the liked tweet in memory
      //
      let old_tweet = this.mod.returnTweet(sig);
      if (old_tweet) {
        this.insertTweetIntoList(old_tweet, this.profile.menu.likes);
        this.app.connection.emit('update-profile-stats', 'likes', list_of_liked_tweet_sigs.length);
      } else {
        //
        // Otherwise, we gotta hit up the archive
        //
        console.log('RS.Profile -- pull liked tweet from archive...');
        this.app.storage.loadTransactions(
          { field1: 'RedSquare', sig },
          (txs) => {
            for (let z = 0; z < txs.length; z++) {
              let tweet = new Tweet(this.app, this.mod, txs[z]);
              this.insertTweetIntoList(tweet, this.profile.menu.likes);
            }
            this.app.connection.emit(
              'update-profile-stats',
              'likes',
              list_of_liked_tweet_sigs.length
            );
          },
          peer
        );
      }
    }
  }

  insertTweetIntoList(tweet, list) {
    let insertion_index = 0;

    for (let i = 0; i < list.length; i++) {
      if (list[i].tx.signature === tweet.tx.signature) {
        return;
      }

      if (tweet.created_at > list[i].created_at) {
        break;
      } else {
        insertion_index++;
      }
    }
    list.splice(insertion_index, 0, tweet);
  }

  filterProfileTweets(txs, user_id) {
    const profile_lists =
      user_id === this.profile.publicKey ? this.profile.menu : this.profile_tweets[user_id];

    for (let z = 0; z < txs.length; z++) {
      let tweet = new Tweet(this.app, this.mod, txs[z]);
      if (tweet?.noerrors) {
        if (tweet.isRetweet()) {
          this.insertTweetIntoList(tweet, profile_lists.retweets);
          return;
        }
        if (tweet.isPost()) {
          this.insertTweetIntoList(tweet, profile_lists.posts);
        }
        if (tweet.isReply()) {
          this.insertTweetIntoList(tweet, profile_lists.replies);
        }
      }
    }

    let str = '';
    for (let key in profile_lists) {
      str += `${key}: ${profile_lists[key].length}, `;
    }

    console.debug(
      'RS.Profile -- ',
      user_id.substring(0, 10),
      this.profile.publicKey.substring(0, 10),
      str
    );
  }

  //
  // this renders a tweet, loads all of its available children and adds them to the page
  // as they appear...
  //
  renderTweet(tweet) {
    //
    // make sure visible
    //
    tweet.curated = 1;
    tweet.force_long_tweet = true;

    if (this.mod.debug) {
      console.debug(
        'RS.renderTweet --',
        tweet.tx.signature,
        tweet.parent_id,
        tweet.thread_id,
        this.thread_id
      );
    }
    //
    // get thread id
    //
    let thread_id = tweet.thread_id || tweet.parent_id || tweet.tx.signature;

    //
    // remove tweets - TODO holder
    //
    document.querySelector('.tweet-container').innerHTML = '';

    const markHighlightedTweet = () => {
      if (document.querySelector(`.tweet-${tweet.tx.signature}`)) {
        document.querySelector(`.tweet-${tweet.tx.signature}`).classList.add('highlight-tweet');

        if (this.mod.curated) {
          Array.from(document.querySelectorAll('.tweet-container > .tweet')).forEach((t) => {
            if (window.getComputedStyle(t).display != 'grid') {
              console.warn('hidden comment!!!');
              console.log(t, window.getComputedStyle(t).display);
              if (!document.querySelector('.show-more-button')) {
                this.app.browser.addElementAfterSelector(
                  `<div class="show-more-button saito-button-secondary">show hidden comments</div>`,
                  '.tweet-container'
                );
                document.querySelector('.show-more-button').onclick = (e) => {
                  if (document.querySelector('.tweet-container')) {
                    document.querySelector('.tweet-container').classList.remove('active-curation');
                  }
                };
              }
            }
          });
        }
      }
    };

    this.thread_id = thread_id;

    if (!tweet.thread_sigs) {
      tweet.thread_sigs = this.mod.returnThreadSigs(tweet.tx.signature);
    }

    //
    // show our tweet
    //
    let root_tweet = this.mod.returnTweet(thread_id);

    if (!root_tweet?.isLoaded()) {
      this.showLoader();

      siteMessage('Querying full thread...', 2000);
      console.log('RS.Load thread... in 500ms');

      //
      // We set a timeout so that loading by url gives the peer connections a second to get established before requesting the full thread
      // We should investigate why sendRequestAsTransaction() has a disconnect between the returned results and what the callback sees
      // when we perform this request synchronously
      // loadTransactions() -> [storage] network.sendRequestAsTransaction -> archive -- hits an error in [storage] internal_callback
      //
      setTimeout(this.mod.loadTweetThread.bind(this.mod), 500, thread_id, () => {
        console.log('RS...callback -- ', thread_id);
        //
        // This will catch you navigating back to the main feed before the callback completes
        //
        if (this.mode === 'tweet' && this.thread_id === thread_id) {
          let root_tweet = this.mod.returnTweet(thread_id);

          if (root_tweet) {
            root_tweet.renderWithChildrenWithTweet(tweet, tweet.thread_sigs);
          } else {
            console.warn('Root tweet not found...');
          }

          markHighlightedTweet();
        } else {
          console.info('RS.load thread returned... opt out of rendering');
        }

        this.hideLoader();
      });
    } else {
      root_tweet.renderWithChildrenWithTweet(tweet, tweet.thread_sigs);
      markHighlightedTweet();
    }
  }

  attachEvents() {
    if (this.events_attached) {
      return;
    }

    /* Scroll the right side bar code (originally in ./sidebar.js) */
    var scrollableElement = document.querySelector('.saito-container');
    var sidebar = document.querySelector('.saito-sidebar.right');
    var scrollTop = 0;
    var stop = 0;

    scrollableElement.addEventListener('scroll', (e) => {
      let newScrollTop = scrollableElement.scrollTop;
      let maxScroll = sidebar.clientHeight - window.innerHeight + 70;

      if (maxScroll > 0) {
        if (scrollTop < newScrollTop) {
          if (newScrollTop - stop > maxScroll) {
            stop = window.innerHeight - 70 - sidebar.clientHeight + newScrollTop;
          }
        } else {
          if (stop > newScrollTop) {
            stop = newScrollTop;
          }
        }
      } else {
        //Keep top of side bar fixed relative to viewPort
        stop = newScrollTop;
      }

      sidebar.style.top = stop + 'px';
      scrollTop = newScrollTop;
    });

    /* Code for the slide-out header */
    /*
    var scrollableElement = document.querySelector('.saito-container');

    let lastScrollTop = 0;
    let triggered = false;
    let is_running = false;

    if (this.app.browser.isSupportedBrowser()) {
      let hh = getComputedStyle(document.body).getPropertyValue('--saito-header-height');

      scrollableElement.addEventListener('scroll', (e) => {
        var st = scrollableElement.scrollTop;

        if (is_running) {
          return;
        }

        is_running = true;

        if (st > lastScrollTop) {
          if (!triggered) {
            document.getElementById('saito-header').style.top = `-${hh}`;
            document.getElementById('saito-header').style.height = '0';
            document.getElementById('saito-header').style.padding = '0';
            document.querySelector('.saito-container').classList.add('scrolling');
            document.querySelector('.saito-sidebar.left').classList.add('scrolling');
            triggered = true;
          }

          is_running = 'down';
        } else if (st < lastScrollTop) {
          if (triggered) {
            document.getElementById('saito-header').removeAttribute('style');
            document.querySelector('.saito-container').classList.remove('scrolling');
            document.querySelector('.saito-sidebar.left').classList.remove('scrolling');
            triggered = false;
          }
        }

        lastScrollTop = st <= 0 ? 0 : st; // For Mobile or negative scrolling

        if (this.mode == 'tweets') {
          this.scroll_depth = scrollableElement.scrollTop;
        }

        setTimeout(() => {
          is_running = false;
          if (scrollableElement.scrollTop < 50 && triggered) {
            document.getElementById('saito-header').removeAttribute('style');
            document.querySelector('.saito-container').classList.remove('scrolling');
            document.querySelector('.saito-sidebar.left').classList.remove('scrolling');
            triggered = false;
          }
        }, 75);
      });
    }*/

    this.events_attached = true;
  }

  scrollFeed(newDepth = this.scroll_depth, behavior = 'auto') {
    const elem = document.querySelector('.saito-container');
    if (this.mode === 'tweets') {
      this.scroll_depth = elem.scrollTop;
      //console.info('Cache scroll depth of RS Feed -- ', this.scroll_depth);
    }
    //console.info('Scroll RS tweet container to : ', newDepth);
    elem.scroll({ top: newDepth, left: 0, behavior });
  }

  enableObserver() {
    //
    // dynamic content loading
    //
    this.hideLoader();

    let ob = document.getElementById('intersection-observer-trigger');

    if (ob) {
      if (ob.classList.contains('deactivated')) {
        ob.classList.remove('deactivated');

        if (ob.getBoundingClientRect().top <= 0) {
          //console.debug('RS.Observer out of bounds...', ob.getBoundingClientRect().top);
          this.handleIntersection();
        } else {
          //console.debug('Turn on observer', ob.getBoundingClientRect().top);
          this.intersectionObserver.observe(ob);
        }
      }
    }
  }

  handleIntersection() {
    if (this.mode === 'tweet' || this.mode == 'loading') {
      return;
    }

    console.debug('RS.IntersectionObserver triggered! ', this.mode);

    //
    // load more tweets -- from local and remote sources
    //
    if (this.mode === 'tweets') {
      this.showLoader(`${this.mod.tweets.length} tweets in the feed, loading more...`);

      this.numActivePeers = this.mod.loadTweets('earlier', this.insertOlderTweets.bind(this));
      if (!this.numActivePeers) {
        console.log('RS.handleIntersection -- smack box on the side');
        this.mod.tweets_earliest_ts--;
        this.numActivePeers = this.mod.loadTweets('earlier', this.insertOlderTweets.bind(this));
        if (!this.numActivePeers) {
          console.debug(
            'RS.insertOlderTweets: END of REDSQUARE !!!!',
            this.mod.tweets_earliest_ts,
            this.mod.peers
          );
          this.hideLoader();
          if (!document.querySelector('.saito-end-of-redsquare')) {
            this.app.browser.addElementAfterSelector(
              `<div class="saito-end-of-redsquare">no more tweets</div>`,
              '.tweet-container'
            );
          }
        }
      }

      return;
    }

    this.showLoader();

    //
    // load more notifications
    //
    if (this.mode === 'notifications') {
      this.moreNotifications();
    }

    /////////////////////////////////////////////////
    //
    // So right now, we are fetching earlier stuff from the intersection observer
    // We will fetch the 100 most recent tweets/likes, so we'll see if people start complaining
    // about not having enough history available
    //
    //////////////////////////////////////////////////

    if (this.mode === 'profile') {
      this.loadProfile();
    }
  }
  showLoader(msg = '') {
    this.loader.show(msg);
  }

  hideLoader() {
    this.loader.remove(0);
  }
}

module.exports = RedSquareMain;
