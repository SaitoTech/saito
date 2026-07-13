const ManagerTemplate = require('./manager.template');
const ManagerScrollFooterTemplate = require('./manager-scroll-footer.template');
const ManagerLoadMore = require('./manager-load-more');
const TweetTemplate = require('./tweet.template');

const SCROLL_THRESHOLD_PX = 240;

class Manager {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.mode = 'timeline';
    this.active_signature = '';
    this.active_thread_id = '';

    this.timeline_rendered = false;
    this.notifications_rendered = false;
    this.scroll_positions = {
      timeline: 0,
      notifications: 0,
      thread: 0
    };

    this.pagination = this.createPaginationState();
    this.pending_newer_tweets = [];
    this._timeline_bootstrapping = false;
  }

  createPaginationState() {
    return {
      timeline: {
        cursor: 0,
        batchSize: 5,
        loading: false,
        exhausted: false,
        mockPage: 0
      },
      notifications: {
        cursor: 0,
        batchSize: 2,
        loading: false,
        exhausted: false,
        mockPage: 0
      },
      thread: {
        cursor: 0,
        batchSize: 2,
        loading: false,
        exhausted: false,
        mockPage: 0,
        chain: []
      }
    };
  }

  renderTimeline() {
    const previousMode = this.mode;

    this.saveScrollPosition(previousMode);
    this.mode = 'timeline';
    this.active_signature = '';
    this.render();

    if (previousMode !== 'timeline') {
      this.resetMenuToHome();
    }

    this.restoreScrollPosition('timeline');
    this.syncScrollFooter();
    this.syncPendingNewerTweets();
  }

  renderNotifications() {
    this.saveScrollPosition();
    this.mod.markNotificationsViewed?.();
    this.mode = 'notifications';
    this.render();
    this.restoreScrollPosition('notifications');
    this.syncScrollFooter();
    this.fetchRemoteTransactions('notifications', 'newer');
  }

  renderThread(signature) {
    this.saveScrollPosition();

    const tweet = this.mod.getTweet(signature);

    this.mode = 'thread';
    this.active_signature = signature || '';
    this.active_thread_id = tweet ? tweet.thread_id || tweet.signature : '';
    this.scroll_positions.thread = 0;
    this.resetThreadPagination(signature);
    this.render();
    this.restoreScrollPosition('thread');
    this.syncScrollFooter();
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.ensureShell();
    this.updateModeVisibility();

    switch (this.mode) {
      case 'thread':
        this.paintThread();
        break;
      case 'notifications':
        this.paintNotifications();
        break;
      case 'timeline':
      default:
        this.paintTimeline();
        break;
    }

    this.updateHeaderNavigation();
    this.attachEvents();
    this.syncScrollFooter();
  }

  ensureShell() {
    const root = document.querySelector(this.container);

    if (!root || root.querySelector('.manager-timeline')) {
      return;
    }

    this.app.browser.replaceElementContentBySelector(ManagerTemplate(), this.container);
    this.timeline_rendered = false;
    this.notifications_rendered = false;
    this.pagination = this.createPaginationState();
    this.pending_newer_tweets = [];
    this._timeline_bootstrapping = false;
  }

  updateModeVisibility() {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    const timeline = root.querySelector('.manager-timeline');
    const thread = root.querySelector('.manager-thread');
    const notifications = root.querySelector('.manager-notifications');

    if (timeline) {
      timeline.classList.toggle('manager-panel-hidden', this.mode !== 'timeline');
    }

    if (thread) {
      thread.classList.toggle('manager-panel-hidden', this.mode !== 'thread');
    }

    if (notifications) {
      notifications.classList.toggle('manager-panel-hidden', this.mode !== 'notifications');
    }

    if (this.mode !== 'timeline') {
      this.hideNewPostsBanner();
    } else if (this.pending_newer_tweets.length) {
      this.showNewPostsBanner();
    }
  }

  updateHeaderNavigation() {
    const header = this.mod.header;

    if (!header) {
      return;
    }

    if (this.mode === 'timeline') {
      header.disableBackButton();
      return;
    }

    header.enableBackButton(() => {
      this.renderTimeline();
    });
  }

  getScrollContainer() {
    return document.querySelector('#saito-container') || document.querySelector('.saito-container');
  }

  saveScrollPosition(mode = this.mode) {
    const scroller = this.getScrollContainer();

    if (!scroller || !mode || !this.scroll_positions) {
      return;
    }

    this.scroll_positions[mode] = scroller.scrollTop;
  }

  restoreScrollPosition(mode = this.mode) {
    const scroller = this.getScrollContainer();

    if (!scroller || !mode || !this.scroll_positions) {
      return;
    }

    const scrollTop = this.scroll_positions[mode] || 0;

    requestAnimationFrame(() => {
      scroller.scrollTop = scrollTop;
    });
  }

  resetMenuToHome() {
    const homeItem = document.querySelector('.sidebar-left .menu-item:nth-child(1)');

    if (homeItem && this.mod.main?.menu) {
      this.mod.main.menu.setActiveMenuItem(homeItem);
    }
  }

  getPaginationState() {
    return this.pagination[this.mode] || this.pagination.timeline;
  }

  getEndMessage() {
    switch (this.mode) {
      case 'notifications':
        return "You're all caught up";
      case 'thread':
        return 'No more replies in this thread';
      case 'timeline':
      default:
        return 'No more tweets available';
    }
  }

  getActivePanelElement() {
    const root = document.querySelector(this.container);

    if (!root) {
      return null;
    }

    switch (this.mode) {
      case 'thread':
        return root.querySelector('.manager-thread');
      case 'notifications':
        return root.querySelector('.manager-notifications');
      case 'timeline':
      default:
        return root.querySelector('.manager-timeline');
    }
  }

  getActivePanelSelector() {
    switch (this.mode) {
      case 'thread':
        return `${this.container} .manager-thread`;
      case 'notifications':
        return `${this.container} .manager-notifications`;
      case 'timeline':
      default:
        return `${this.container} .manager-timeline`;
    }
  }

  clearPanel(selector) {
    const panel = document.querySelector(selector);

    if (panel) {
      panel.innerHTML = '';
    }
  }

  paintTimeline() {
    if (this.timeline_rendered || this._timeline_bootstrapping) {
      return;
    }

    this.bootstrapTimeline();
  }

  async bootstrapTimeline() {
    if (this.timeline_rendered || this._timeline_bootstrapping) {
      return;
    }

    this._timeline_bootstrapping = true;

    if (this.timeline_rendered) {
      this._timeline_bootstrapping = false;
      return;
    }

    this.appendTimelineBatch();
    this.timeline_rendered = true;
    this._timeline_bootstrapping = false;

    this.fetchRemoteTransactions('tweets', 'newer');
  }

  paintThread() {
    const container = `${this.container} .manager-thread`;

    this.clearPanel(container);
    this.renderThreadContextLink(container);
    this.appendThreadBatch();
  }

  renderThreadContextLink(container) {
    const focused = this.mod.getTweet(this.active_signature);

    if (!focused?.parent_id) {
      return;
    }

    const parent = this.mod.getTweet(focused.parent_id);

    if (!parent) {
      return;
    }

    const root = this.getThreadRoot(this.active_signature);
    const html = `
      <div class="manager-thread-context" role="button" tabindex="0" data-root="${root}">
        View entire thread
      </div>
    `;

    this.app.browser.addElementToSelector(html, container);
  }

  paintNotifications() {
    if (this.notifications_rendered) {
      return;
    }

    this.appendNotificationsBatch();
    this.notifications_rendered = true;
  }

  appendTimelineBatch() {
    const state = this.pagination.timeline;
    const signatures = this.mod.tweets_timeline.slice(state.cursor, state.cursor + state.batchSize);
    const container = this.getActivePanelSelector();

    if (signatures.length === 0) {
      return 0;
    }

    for (const signature of signatures) {
      const tweet = this.mod.getTweet(signature);

      if (tweet) {
        this.renderTweetWithCriticalChild(tweet, container);
      }
    }

    state.cursor += signatures.length;

    return signatures.length;
  }

  appendNotificationsBatch() {
    const state = this.pagination.notifications;
    const signatures = this.mod.notifications_timeline.slice(state.cursor, state.cursor + state.batchSize);
    const container = this.getActivePanelSelector();

    if (signatures.length === 0) {
      return 0;
    }

    for (const signature of signatures) {
      const notification = this.mod.getNotification(signature);

      if (notification) {
        notification.render(container);
      }
    }

    state.cursor += signatures.length;

    return signatures.length;
  }

  appendThreadBatch() {
    const state = this.pagination.thread;
    const signatures = state.chain.slice(state.cursor, state.cursor + state.batchSize);
    const container = this.getActivePanelSelector();

    if (signatures.length === 0) {
      return 0;
    }

    for (let i = 0; i < signatures.length; i++) {
      const signature = signatures[i];
      const tweet = this.mod.getTweet(signature);
      const globalIndex = state.cursor + i;

      if (!tweet) {
        continue;
      }

      const options = this.buildThreadRenderOptions(globalIndex, state.chain.length);
      tweet.render(container, options);
    }

    state.cursor += signatures.length;

    return signatures.length;
  }

  buildThreadRenderOptions(globalIndex, chainLength) {
    const options = {};

    if (globalIndex === 0) {
      options.focused = true;
    } else {
      options.chainPrev = true;
    }

    if (globalIndex < chainLength - 1) {
      options.chainNext = true;
      options.chainContinue = true;
    }

    return options;
  }

  appendLoadedItems(result) {
    const container = this.getActivePanelSelector();
    const state = this.getPaginationState();
    const signatures = result.added || [];

    if (this.mode === 'notifications') {
      for (const signature of signatures) {
        const notification = this.mod.getNotification(signature);

        if (notification) {
          notification.render(container);
        }
      }

      state.cursor += signatures.length;
      return;
    }

    if (this.mode === 'thread') {
      const startIndex = state.cursor;

      for (let i = 0; i < signatures.length; i++) {
        const signature = signatures[i];
        const tweet = this.mod.getTweet(signature);
        const globalIndex = startIndex + i;

        if (!tweet) {
          continue;
        }

        tweet.render(container, this.buildThreadRenderOptions(globalIndex, state.chain.length));
      }

      state.cursor += signatures.length;
      return;
    }

    for (const signature of signatures) {
      const tweet = this.mod.getTweet(signature);

      if (!tweet || tweet.parent_id) {
        continue;
      }

      this.renderTweetWithCriticalChild(tweet, container);
    }

    state.cursor += signatures.length;
  }

  resetThreadPagination(signature) {
    this.pagination.thread = {
      ...this.createPaginationState().thread,
      chain: this.buildThreadView(signature)
    };
  }

  buildThreadView(signature) {
    if (!signature) {
      return [];
    }

    return [signature, ...this.getDirectReplies(signature)];
  }

  getDirectReplies(parentSignature) {
    const children = this.mod.tweets_children[parentSignature] || [];

    return children
      .map((sig) => this.mod.getTweet(sig))
      .filter(Boolean)
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
      .map((tweet) => tweet.signature);
  }

  getThreadRoot(signature) {
    let root = signature;

    while (this.mod.tweets_parents[root]) {
      root = this.mod.tweets_parents[root];
    }

    return root;
  }

  //
  // Compose integration — Manager owns all post-submit rendering
  //

  onTweetPosted(tweet) {
    if (!tweet) {
      return;
    }

    const isReply = Boolean(tweet.parent_id);

    if (this.mode === 'thread' && isReply && tweet.parent_id === this.active_signature) {
      this.insertThreadReply(tweet);
      return;
    }

    if (this.mode !== 'timeline') {
      if (isReply) {
        this.openThreadForPostedReply(tweet);
        return;
      }

      this.renderTimelineForNewPost();
    }

    if (!isReply) {
      this.insertTimelineTweet(tweet);
    }
  }

  isTweetInActiveThread(tweet) {
    if (!tweet || !this.active_thread_id) {
      return false;
    }

    const threadId = tweet.thread_id || tweet.signature;
    return threadId === this.active_thread_id;
  }

  renderTimelineForNewPost() {
    this.saveScrollPosition();
    this.mode = 'timeline';
    this.active_signature = '';
    this.scroll_positions.timeline = 0;
    this.updateModeVisibility();
    this.updateHeaderNavigation();
    this.resetMenuToHome();

    if (!this.timeline_rendered) {
      this.paintTimeline();
    }

    this.syncScrollFooter();

    requestAnimationFrame(() => {
      const scroller = this.getScrollContainer();

      if (scroller) {
        scroller.scrollTop = 0;
      }
    });
  }

  openThreadForPostedReply(tweet) {
    if (!tweet) {
      return;
    }

    this.renderThread(tweet.signature);
  }

  insertTimelineTweet(tweet) {
    if (!tweet || tweet.parent_id) {
      return;
    }

    const container = `${this.container} .manager-timeline`;
    const panel = document.querySelector(container);

    if (!panel) {
      return;
    }

    const child = tweet.critical_child ? this.mod.getTweet(tweet.critical_child) : null;
    const options = {};

    if (child) {
      options.chainNext = true;
      options.chainContinue = true;
    }

    const html = TweetTemplate(tweet, tweet.buildClassName(options));
    this.app.browser.prependElementToSelector(html, container);

    this.pagination.timeline.cursor += 1;
    this.timeline_rendered = true;

    const element = panel.querySelector(`article.tweet[data-id="${tweet.signature}"]`);
    this.animateTweetInsertion(element);
  }

  insertThreadReply(tweet) {
    if (!tweet || tweet.parent_id !== this.active_signature) {
      return;
    }

    const container = `${this.container} .manager-thread`;
    const panel = document.querySelector(container);

    if (!panel) {
      return;
    }

    const options = { chainPrev: true };
    const html = TweetTemplate(tweet, tweet.buildClassName(options));
    const focusedEl = panel.querySelector(`article.tweet[data-id="${this.active_signature}"]`);
    const replies = panel.querySelectorAll(`article.tweet:not([data-id="${this.active_signature}"])`);
    const lastReply = replies.length ? replies[replies.length - 1] : null;
    const anchor = lastReply || focusedEl;

    if (lastReply) {
      lastReply.classList.add('chain-next', 'chain-continue');
    } else if (focusedEl) {
      focusedEl.classList.add('chain-next', 'chain-continue');
    }

    if (anchor) {
      anchor.insertAdjacentHTML('afterend', html);
    } else {
      this.app.browser.addElementToSelector(html, container);
    }

    if (!this.pagination.thread.chain.includes(tweet.signature)) {
      this.pagination.thread.chain.push(tweet.signature);
    }

    this.pagination.thread.cursor += 1;

    const element = panel.querySelector(`article.tweet[data-id="${tweet.signature}"]`);
    this.animateTweetInsertion(element);
  }

  animateTweetInsertion(element) {
    if (!element) {
      return;
    }

    element.classList.add('tweet-enter');

    const onEnd = () => {
      element.classList.remove('tweet-enter');
      element.removeEventListener('animationend', onEnd);
    };

    element.addEventListener('animationend', onEnd);
  }

  renderTweetWithCriticalChild(tweet, container, options = {}) {
    this.renderTweetChain(tweet, container, options, false);
  }

  renderCriticalChildChain(tweet, container, options = {}) {
    this.renderTweetChain(tweet, container, options, true);
  }

  renderTweetChain(tweet, container, options = {}, followFullChain = false) {
    if (!tweet) {
      return;
    }

    const child = tweet.critical_child ? this.mod.getTweet(tweet.critical_child) : null;
    const renderOptions = { ...options };

    if (child) {
      renderOptions.chainNext = true;
      renderOptions.chainContinue = true;
    }

    tweet.render(container, renderOptions);

    if (!child) {
      return;
    }

    const childOptions = { chainPrev: true };

    if (followFullChain) {
      this.renderTweetChain(child, container, childOptions, true);
      return;
    }

    child.render(container, childOptions);
  }

  attachEvents() {
    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    this.attachTweetNavigation(root);
    this.attachThreadContext(root);
    this.attachTweetMenu(root);
    this.attachTweetReply(root);
    this.attachScrollEvents();
  }

  attachThreadContext(root) {
    if (!root || root.dataset.threadContextBound === '1') {
      return;
    }

    root.dataset.threadContextBound = '1';

    root.addEventListener('click', (e) => {
      const link = e.target.closest('.manager-thread-context');

      if (!link) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const rootSignature = link.getAttribute('data-root') || '';

      if (rootSignature) {
        this.renderThread(rootSignature);
      }
    });
  }

  attachTweetReply(root) {
    if (!root || root.dataset.tweetReplyBound === '1') {
      return;
    }

    root.dataset.tweetReplyBound = '1';

    root.addEventListener('click', (e) => {
      const replyButton = e.target.closest('.tweet-tool-comment');

      if (!replyButton) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const tweetArticle = replyButton.closest('article.tweet');
      const signature = tweetArticle?.getAttribute('data-id') || '';
      const tweet = this.mod.getTweet(signature);

      if (tweet) {
        this.mod.compose_overlay?.open({ reply_to: tweet });
      }
    });
  }

  attachTweetMenu(root) {
    if (!root || root.dataset.tweetMenuBound === '1') {
      return;
    }

    root.dataset.tweetMenuBound = '1';

    root.addEventListener('click', (e) => {
      const moreButton = e.target.closest('.tweet-tool-more');

      if (!moreButton) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      const tweetArticle = moreButton.closest('article.tweet');

      if (!tweetArticle) {
        return;
      }

      const signature = tweetArticle.getAttribute('data-id') || '';

      if (!signature) {
        return;
      }

      const tweet = this.mod.getTweet(signature);

      if (!tweet) {
        return;
      }

      this.mod.tweet_menu?.toggle({ anchor: moreButton, tweet });
    });
  }

  attachTweetNavigation(root) {
    if (!root || root.dataset.tweetNavigationBound === '1') {
      return;
    }

    root.dataset.tweetNavigationBound = '1';

    root.addEventListener('click', (e) => {
      const signature = Manager.resolveClickedSignature(e.target);

      if (!signature) {
        return;
      }

      this.renderThread(signature);
    });
  }

  attachScrollEvents() {
    if (this.scroll_bound) {
      return;
    }

    const scroller = this.getScrollContainer();

    if (!scroller) {
      return;
    }

    this.scroll_bound = true;

    scroller.addEventListener(
      'scroll',
      () => {
        if (this.scroll_raf) {
          return;
        }

        this.scroll_raf = requestAnimationFrame(() => {
          this.scroll_raf = null;
          this.onScroll();
        });
      },
      { passive: true }
    );
  }

  onScroll() {
    if (!this.isNearBottom()) {
      return;
    }

    this.loadMoreIfNeeded();
  }

  isNearBottom() {
    const scroller = this.getScrollContainer();

    if (!scroller) {
      return false;
    }

    const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;

    return remaining <= SCROLL_THRESHOLD_PX;
  }

  isNearTop() {
    const scroller = this.getScrollContainer();

    if (!scroller) {
      return true;
    }

    return scroller.scrollTop <= SCROLL_THRESHOLD_PX;
  }

  fetchRemoteTransactions(type, direction) {
    this.mod.loadTransactions(type, direction, (result) => {
      const payload = result || {
        type,
        direction,
        added: [],
        updated: [],
        ignored: [],
        exhausted: true
      };

      if (direction === 'newer') {
        this.onNewerContentLoaded(payload);
      }
    });
  }

  onPeersUpdated() {
    if (this.mode === 'timeline' && this.timeline_rendered) {
      this.fetchRemoteTransactions('tweets', 'newer');
    }
  }

  onNewerContentLoaded(result) {
    if (!result) {
      return;
    }

    if (result.type === 'tweets') {
      this.handleNewerTweets(result);
      return;
    }

    if (result.type === 'notifications' && this.mode === 'notifications') {
      this.handleNewerNotifications(result);
    }
  }

  canAutoInsertTimeline() {
    if (this.mode !== 'timeline' || !this.timeline_rendered) {
      return false;
    }

    if (!this.isNearTop()) {
      return false;
    }

    return !this.isUserInteractionBlocking();
  }

  isUserInteractionBlocking() {
    if (this.mod.compose_overlay?.getRoot?.()) {
      return true;
    }

    if (this.mod.tweet_menu?.isOpen) {
      return true;
    }

    if (this.mod.settings_overlay?.getRoot?.()) {
      return true;
    }

    return false;
  }

  handleNewerTweets(result) {
    if (!result?.added?.length) {
      return;
    }

    for (const signature of result.added) {
      if (!this.pending_newer_tweets.includes(signature)) {
        this.pending_newer_tweets.push(signature);
      }
    }

    if (this.canAutoInsertTimeline()) {
      this.flushPendingNewerTweets({ scrollToTop: false });
      return;
    }

    if (this.mode === 'timeline') {
      this.showNewPostsBanner();
    }
  }

  syncPendingNewerTweets() {
    if (!this.pending_newer_tweets.length) {
      this.hideNewPostsBanner();
      return;
    }

    if (this.canAutoInsertTimeline()) {
      this.flushPendingNewerTweets({ scrollToTop: false });
      return;
    }

    if (this.mode === 'timeline') {
      this.showNewPostsBanner();
    }
  }

  handleNewerNotifications(result) {
    if (!result?.added?.length) {
      return;
    }

    this.prependNotifications(result.added);
    this.pagination.notifications.exhausted = false;
    this.hideScrollFooter();
  }

  prependTimelineTweets(signatures) {
    const container = `${this.container} .manager-timeline`;
    const panel = document.querySelector(container);

    if (!panel || !signatures?.length) {
      return;
    }

    const tweets = signatures
      .map((signature) => this.mod.getTweet(signature))
      .filter((tweet) => tweet && !tweet.parent_id)
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    for (const tweet of tweets) {
      const child = tweet.critical_child ? this.mod.getTweet(tweet.critical_child) : null;
      const options = {};

      if (child) {
        options.chainNext = true;
        options.chainContinue = true;
      }

      const html = TweetTemplate(tweet, tweet.buildClassName(options));
      this.app.browser.prependElementToSelector(html, container);

      if (child) {
        const childHtml = TweetTemplate(child, child.buildClassName({ chainPrev: true }));
        const parentEl = panel.querySelector(`article.tweet[data-id="${tweet.signature}"]`);

        if (parentEl) {
          parentEl.insertAdjacentHTML('afterend', childHtml);
        }
      }
    }

    this.pagination.timeline.cursor += signatures.length;
    this.timeline_rendered = true;
  }

  prependNotifications(signatures) {
    const container = `${this.container} .manager-notifications`;
    const panel = document.querySelector(container);

    if (!panel || !signatures?.length) {
      return;
    }

    const notifications = signatures
      .map((signature) => this.mod.getNotification(signature))
      .filter(Boolean)
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    for (const notification of notifications) {
      const html = notification.renderHTML();

      if (html) {
        this.app.browser.prependElementToSelector(html, container);
      }
    }

    this.pagination.notifications.cursor += signatures.length;
    this.notifications_rendered = true;
  }

  showNewPostsBanner() {
    if (!this.pending_newer_tweets.length || this.mode !== 'timeline') {
      return;
    }

    const root = document.querySelector(this.container);

    if (!root) {
      return;
    }

    let banner = root.querySelector('.manager-new-posts-banner');

    if (!banner) {
      const body = root.querySelector('.manager-body');

      banner = document.createElement('button');
      banner.className = 'manager-new-posts-banner';
      banner.type = 'button';
      banner.textContent = 'New posts available';
      banner.addEventListener('click', () => {
        this.revealPendingNewerTweets();
      });

      if (body) {
        root.insertBefore(banner, body);
      } else {
        root.prepend(banner);
      }
    }

    banner.hidden = false;
    banner.classList.remove('manager-new-posts-banner-hidden');
  }

  hideNewPostsBanner() {
    const banner = document.querySelector(`${this.container} .manager-new-posts-banner`);

    if (!banner) {
      return;
    }

    banner.hidden = true;
    banner.classList.add('manager-new-posts-banner-hidden');
  }

  revealPendingNewerTweets() {
    this.flushPendingNewerTweets({ scrollToTop: true });
  }

  flushPendingNewerTweets({ scrollToTop = false } = {}) {
    const signatures = this.pending_newer_tweets.slice();
    this.pending_newer_tweets = [];
    this.hideNewPostsBanner();

    if (!signatures.length) {
      return;
    }

    this.prependTimelineTweets(signatures);
    this.pagination.timeline.exhausted = false;
    this.hideScrollFooter();

    if (scrollToTop) {
      requestAnimationFrame(() => {
        const scroller = this.getScrollContainer();

        if (scroller) {
          scroller.scrollTop = 0;
        }
      });
    }
  }

  sliceUnrendered(signatures, cursor, batchSize) {
    if (cursor >= signatures.length) {
      return [];
    }

    return signatures.slice(cursor, cursor + batchSize);
  }

  loadMoreIfNeeded() {
    const state = this.getPaginationState();

    if (state.loading || state.exhausted) {
      return;
    }

    this.loadMore();
  }

  async loadMore() {
    const state = this.getPaginationState();

    if (state.loading || state.exhausted) {
      return;
    }

    state.loading = true;
    this.showScrollFooter('loading');

    let continueLoading = false;

    try {
      if (this.mode === 'thread') {
        const result = await ManagerLoadMore.loadMore({
          mode: this.mode,
          mod: this.mod,
          pagination: this.pagination,
          active_thread_id: this.active_thread_id,
          active_signature: this.active_signature
        });

        continueLoading = this.applyOlderLoadResult(result);
        return;
      }

      const type = this.mode === 'notifications' ? 'notifications' : 'tweets';
      const timeline =
        type === 'notifications' ? this.mod.notifications_timeline : this.mod.tweets_timeline;
      const pending = this.sliceUnrendered(timeline, state.cursor, state.batchSize);

      if (pending.length > 0) {
        continueLoading = this.applyOlderLoadResult({
          type,
          direction: 'older',
          added: pending.slice(),
          updated: [],
          ignored: [],
          exhausted: false
        });
        return;
      }

      await new Promise((resolve) => {
        this.mod.loadTransactions(type, 'older', (result) => {
          continueLoading = this.applyOlderLoadResult(
            result || {
              type,
              direction: 'older',
              added: [],
              updated: [],
              ignored: [],
              exhausted: true
            }
          );
          resolve();
        });
      });
    } finally {
      state.loading = false;
    }

    if (continueLoading) {
      this.loadMoreIfNeeded();
    }
  }

  applyOlderLoadResult(result) {
    const state = this.getPaginationState();

    if (result.added?.length) {
      this.appendLoadedItems(result);
      this.hideScrollFooter();
      return this.isNearBottom();
    }

    if (result.exhausted) {
      state.exhausted = true;
      this.showScrollFooter('end', this.getEndMessage());
    }

    return false;
  }

  ensureScrollFooter() {
    const panel = this.getActivePanelElement();

    if (!panel) {
      return null;
    }

    let footer = panel.querySelector('.manager-scroll-footer');

    if (!footer) {
      this.app.browser.addElementToSelector(ManagerScrollFooterTemplate(), panel);
      footer = panel.querySelector('.manager-scroll-footer');
    }

    return footer;
  }

  showScrollFooter(state, message = '') {
    const footer = this.ensureScrollFooter();

    if (!footer) {
      return;
    }

    footer.dataset.state = state;

    const endMessage = footer.querySelector('.manager-scroll-end-message');

    if (endMessage) {
      endMessage.textContent = state === 'end' ? message || this.getEndMessage() : '';
    }
  }

  hideScrollFooter() {
    const panel = this.getActivePanelElement();

    if (!panel) {
      return;
    }

    const footer = panel.querySelector('.manager-scroll-footer');

    if (footer) {
      footer.remove();
    }
  }

  syncScrollFooter() {
    const state = this.getPaginationState();

    if (state.exhausted) {
      this.showScrollFooter('end', this.getEndMessage());
      return;
    }

    if (!state.loading) {
      this.hideScrollFooter();
    }
  }

  static isTweetActionTarget(element) {
    if (!element || typeof element.closest !== 'function') {
      return false;
    }

    return Boolean(element.closest('.tweet-controls, .tweet-show-more, .tweet-tool'));
  }

  static resolveClickedSignature(element) {
    if (!element || typeof element.closest !== 'function') {
      return '';
    }

    if (Manager.isTweetActionTarget(element)) {
      return '';
    }

    const tweet = element.closest('article.tweet');

    if (tweet) {
      return tweet.getAttribute('data-id') || '';
    }

    const notification = element.closest('article.notification');

    if (notification) {
      return notification.getAttribute('data-tweet-id') || '';
    }

    return '';
  }
}

module.exports = Manager;
