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
    this.saved_scroll_position = 0;

    this.pagination = this.createPaginationState();
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

  showTimeline() {
    const previousMode = this.mode;

    this.mode = 'timeline';
    this.active_signature = '';
    this.render();

    if (previousMode !== 'timeline') {
      this.resetMenuToHome();
      this.restoreScrollPosition();
    }

    this.syncScrollFooter();
  }

  showNotifications() {
    this.captureScrollPosition();
    this.mod.markNotificationsViewed?.();
    this.mode = 'notifications';
    this.render();
    this.syncScrollFooter();
  }

  showThread(signature) {
    this.captureScrollPosition();

    const tweet = this.mod.getTweet(signature);

    this.mode = 'thread';
    this.active_signature = signature || '';
    this.active_thread_id = tweet ? tweet.thread_id || tweet.signature : '';
    this.resetThreadPagination(signature);
    this.render();
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
        this.renderThread();
        break;
      case 'notifications':
        this.renderNotifications();
        break;
      case 'timeline':
      default:
        this.renderTimeline();
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
      this.showTimeline();
    });
  }

  getScrollContainer() {
    return document.querySelector('#saito-container') || document.querySelector('.saito-container');
  }

  captureScrollPosition() {
    if (this.mode !== 'timeline') {
      return;
    }

    const scroller = this.getScrollContainer();

    this.saved_scroll_position = scroller ? scroller.scrollTop : 0;
  }

  restoreScrollPosition() {
    const scroller = this.getScrollContainer();
    const scrollTop = this.saved_scroll_position || 0;

    if (!scroller) {
      return;
    }

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

  renderTimeline() {
    if (this.timeline_rendered) {
      return;
    }

    const appended = this.appendTimelineBatch();

    this.timeline_rendered = true;

    if (appended === 0 && this.mod.tweets_timeline.length === 0) {
      this.pagination.timeline.exhausted = true;
    }
  }

  renderThread() {
    const container = `${this.container} .manager-thread`;

    this.clearPanel(container);
    this.appendThreadBatch();
  }

  renderNotifications() {
    if (this.notifications_rendered) {
      return;
    }

    const appended = this.appendNotificationsBatch();

    this.notifications_rendered = true;

    if (appended === 0 && this.mod.notifications_timeline.length === 0) {
      this.pagination.notifications.exhausted = true;
    }
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

      const options = {};

      if (signature === this.active_signature) {
        options.focused = true;
      }

      if (globalIndex > 0) {
        options.chainPrev = true;
      }

      if (globalIndex < state.chain.length - 1) {
        options.chainNext = true;
        options.chainContinue = true;
      }

      tweet.render(container, options);
    }

    state.cursor += signatures.length;

    return signatures.length;
  }

  appendLoadedItems(result) {
    const container = this.getActivePanelSelector();
    const state = this.getPaginationState();

    if (this.mode === 'notifications') {
      for (const signature of result.items) {
        const notification = this.mod.getNotification(signature);

        if (notification) {
          notification.render(container);
        }
      }

      state.cursor += result.items.length;
      return;
    }

    if (this.mode === 'thread') {
      const startIndex = state.cursor;

      for (let i = 0; i < result.items.length; i++) {
        const signature = result.items[i];
        const tweet = this.mod.getTweet(signature);
        const globalIndex = startIndex + i;

        if (!tweet) {
          continue;
        }

        const options = {
          chainPrev: globalIndex > 0
        };

        if (globalIndex < state.chain.length - 1) {
          options.chainNext = true;
          options.chainContinue = true;
        }

        tweet.render(container, options);
      }

      state.cursor += result.items.length;
      return;
    }

    for (const signature of result.items) {
      const tweet = this.mod.getTweet(signature);

      if (tweet) {
        this.renderTweetWithCriticalChild(tweet, container);
      }
    }

    state.cursor += result.items.length;
  }

  resetThreadPagination(signature) {
    this.pagination.thread = {
      ...this.createPaginationState().thread,
      chain: this.buildThreadChain(signature)
    };
  }

  buildThreadChain(signature) {
    if (!signature) {
      return [];
    }

    let root = signature;

    while (this.mod.tweets_parents[root]) {
      root = this.mod.tweets_parents[root];
    }

    const chain = [];
    let current = root;

    while (current) {
      chain.push(current);

      const tweet = this.mod.getTweet(current);
      current = tweet?.critical_child || '';
    }

    return chain;
  }

  //
  // Compose integration — Manager owns all post-submit rendering
  //

  onTweetPosted(tweet) {
    if (!tweet) {
      return;
    }

    const isReply = Boolean(tweet.parent_id);

    if (this.mode === 'thread' && isReply && this.isTweetInActiveThread(tweet)) {
      this.insertThreadReply(tweet);
      return;
    }

    if (this.mode !== 'timeline') {
      if (isReply) {
        this.openThreadForPostedReply(tweet);
        return;
      }

      this.showTimelineForNewPost();
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

  showTimelineForNewPost() {
    this.mode = 'timeline';
    this.active_signature = '';
    this.saved_scroll_position = 0;
    this.updateModeVisibility();
    this.updateHeaderNavigation();
    this.resetMenuToHome();

    if (!this.timeline_rendered) {
      this.renderTimeline();
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
    const anchor = tweet.parent_id || tweet.thread_id || tweet.signature;
    const parentTweet = this.mod.getTweet(anchor);
    const signature = parentTweet?.signature || anchor;

    this.mode = 'thread';
    this.active_signature = signature;
    this.active_thread_id = parentTweet?.thread_id || parentTweet?.signature || tweet.thread_id || '';
    this.resetThreadPagination(signature);
    this.updateModeVisibility();
    this.updateHeaderNavigation();

    const container = `${this.container} .manager-thread`;
    this.clearPanel(container);
    this.pagination.thread.cursor = 0;
    this.appendThreadBatch();

    const element = document.querySelector(
      `${container} article.tweet[data-id="${tweet.signature}"]`
    );
    this.animateTweetInsertion(element);
    this.syncScrollFooter();
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
    if (!tweet || !tweet.parent_id) {
      return;
    }

    const container = `${this.container} .manager-thread`;
    const panel = document.querySelector(container);

    if (!panel) {
      return;
    }

    const parentEl = panel.querySelector(`article.tweet[data-id="${tweet.parent_id}"]`);
    const options = { chainPrev: true };
    const html = TweetTemplate(tweet, tweet.buildClassName(options));

    if (parentEl) {
      parentEl.classList.add('chain-next', 'chain-continue');
      parentEl.insertAdjacentHTML('afterend', html);
    } else {
      this.app.browser.addElementToSelector(html, container);
    }

    const parentIndex = this.pagination.thread.chain.indexOf(tweet.parent_id);

    if (parentIndex >= 0 && !this.pagination.thread.chain.includes(tweet.signature)) {
      this.pagination.thread.chain.splice(parentIndex + 1, 0, tweet.signature);
    } else if (!this.pagination.thread.chain.includes(tweet.signature)) {
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

    if (!this.tweet_click_bound) {
      this.tweet_click_bound = true;

      root.addEventListener('click', (e) => {
        const signature = Manager.resolveClickedSignature(e.target);

        if (!signature) {
          return;
        }

        this.showThread(signature);
      });
    }

    this.attachScrollEvents();
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

    try {
      const result = await ManagerLoadMore.loadMore({
        mode: this.mode,
        mod: this.mod,
        pagination: this.pagination,
        active_thread_id: this.active_thread_id
      });

      if (result.items?.length) {
        this.appendLoadedItems(result);
        this.hideScrollFooter();

        if (this.isNearBottom()) {
          this.loadMoreIfNeeded();
        }

        return;
      }

      state.exhausted = true;
      this.showScrollFooter('end', result.message || this.getEndMessage());
    } finally {
      state.loading = false;
    }
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

  static resolveClickedSignature(element) {
    if (!element || typeof element.closest !== 'function') {
      return '';
    }

    const article = element.closest('article.tweet');

    if (!article) {
      return '';
    }

    return article.getAttribute('data-id') || '';
  }
}

module.exports = Manager;
