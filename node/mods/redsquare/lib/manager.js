const ManagerTemplate = require('./manager.template');

class Manager {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;
    this.container = container;

    this.mode = 'timeline';
    this.title = 'Home';
    this.active_thread_id = '';
    this.active_public_key = '';
    this.search_results = [];

    this.tweets = [];
    this.by_signature = {};
    this.children_by_parent = {};
    this.by_thread = {};
  }

  add(tweet) {
    if (!tweet || !tweet.signature) {
      return null;
    }

    const txmsg = tweet.returnTxMessage();

    if (txmsg.module && txmsg.module !== this.mod.name) {
      return null;
    }

    if (txmsg.request && txmsg.request !== 'create tweet') {
      return null;
    }

    const existing = this.by_signature[tweet.signature];

    if (existing) {
      existing.updateFromTransaction(tweet.tx);
      this.sortTimeline();
      return existing;
    }

    this.by_signature[tweet.signature] = tweet;
    this.tweets.push(tweet);
    this.indexRelationships(tweet);
    this.sortTimeline();

    return tweet;
  }

  remove(signature) {
    const tweet = this.by_signature[signature];

    if (!tweet) {
      return false;
    }

    delete this.by_signature[signature];
    this.tweets = this.tweets.filter((t) => t.signature !== signature);
    this.unindexRelationships(tweet);

    return true;
  }

  get(signature) {
    return this.by_signature[signature] || null;
  }

  getChildren(parentId) {
    return this.children_by_parent[parentId] ? this.children_by_parent[parentId].slice() : [];
  }

  getThread(threadId) {
    return this.by_thread[threadId] ? this.by_thread[threadId].slice() : [];
  }

  getVisibleTweets() {
    return this.tweets.filter((tweet) => !tweet.parent_id);
  }

  indexRelationships(tweet) {
    const threadId = tweet.thread_id || tweet.signature;

    if (!this.by_thread[threadId]) {
      this.by_thread[threadId] = [];
    }

    this.by_thread[threadId].push(tweet);

    if (tweet.parent_id) {
      if (!this.children_by_parent[tweet.parent_id]) {
        this.children_by_parent[tweet.parent_id] = [];
      }

      this.children_by_parent[tweet.parent_id].push(tweet);
    }
  }

  unindexRelationships(tweet) {
    const threadId = tweet.thread_id || tweet.signature;
    const thread = this.by_thread[threadId];

    if (thread) {
      this.by_thread[threadId] = thread.filter((t) => t.signature !== tweet.signature);

      if (this.by_thread[threadId].length === 0) {
        delete this.by_thread[threadId];
      }
    }

    if (tweet.parent_id) {
      const siblings = this.children_by_parent[tweet.parent_id];

      if (siblings) {
        this.children_by_parent[tweet.parent_id] = siblings.filter((t) => t.signature !== tweet.signature);

        if (this.children_by_parent[tweet.parent_id].length === 0) {
          delete this.children_by_parent[tweet.parent_id];
        }
      }
    }
  }

  sortTimeline() {
    this.tweets.sort((a, b) => b.created_at - a.created_at);
  }

  showTimeline() {
    this.mode = 'timeline';
    this.title = 'Home';
    this.render();
  }

  showNotifications() {
    this.mode = 'notifications';
    this.title = 'Notifications';
    this.render();
  }

  showThread(threadId) {
    this.mode = 'thread';
    this.title = 'Thread';
    this.active_thread_id = threadId || '';
    this.render();
  }

  showProfile(publicKey) {
    this.mode = 'profile';
    this.title = 'Profile';
    this.active_public_key = publicKey || '';
    this.render();
  }

  showSearch(results = []) {
    this.mode = 'search';
    this.title = 'Search';
    this.search_results = Array.isArray(results) ? results : [];
    this.render();
  }

  render(container = '') {
    if (container) {
      this.container = container;
    }

    this.app.browser.replaceElementContentBySelector(ManagerTemplate(this), this.container);

    switch (this.mode) {
      case 'notifications':
        this.renderNotifications();
        break;
      case 'thread':
        this.renderThread();
        break;
      case 'profile':
        this.renderProfile();
        break;
      case 'search':
        this.renderSearch();
        break;
      case 'timeline':
      default:
        this.renderTimeline();
        break;
    }

    this.attachEvents();
  }

  renderTimeline() {
    for (const tweet of this.getVisibleTweets()) {
      tweet.render(`${this.container} .manager-list`);
    }
  }

  renderThread() {
    const tweets = this.getThread(this.active_thread_id);

    for (const tweet of tweets) {
      tweet.render(`${this.container} .manager-list`);
    }
  }

  renderNotifications() {
    //
    // Notifications panel rendering will be wired here.
    //
  }

  renderProfile() {
    //
    // Profile timeline rendering will be wired here.
    //
  }

  renderSearch() {
    for (const tweet of this.search_results) {
      tweet.render(`${this.container} .manager-list`);
    }
  }

  attachEvents() {}
}

module.exports = Manager;
