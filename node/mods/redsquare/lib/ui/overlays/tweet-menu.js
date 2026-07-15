const TweetMenuTemplate = require('./tweet-menu.template');

class TweetMenu {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;

    this.menuEl = null;
    this.anchor = null;
    this.tweet = null;
    this.actions = [];
    this.isOpen = false;

    this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.onDocumentKeyDown = this.onDocumentKeyDown.bind(this);
    this.onScrollClose = this.onScrollClose.bind(this);
  }

  toggle({ anchor, tweet }) {
    if (this.isOpen && this.anchor === anchor) {
      this.close();
      return;
    }

    this.open({ anchor, tweet });
  }

  open({ anchor, tweet }) {
    if (!anchor || !tweet) {
      return;
    }

    this.close();

    this.anchor = anchor;
    this.tweet = tweet;
    this.actions = this.buildActions(tweet);

    this.app.browser.addElementToDom(TweetMenuTemplate(this));
    this.menuEl = document.querySelector('.tweet-menu');

    if (!this.menuEl) {
      this.close();
      return;
    }

    this.anchor.classList.add('active');
    this.positionMenu();
    this.attachMenuEvents();
    this.addDismissListeners();
    this.isOpen = true;

    requestAnimationFrame(() => {
      this.menuEl?.classList.add('is-open');
    });
  }

  close() {
    if (this.anchor) {
      this.anchor.classList.remove('active');
    }

    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }

    this.removeDismissListeners();

    this.isOpen = false;
    this.anchor = null;
    this.tweet = null;
    this.actions = [];
  }

  buildActions(tweet) {
    const username = tweet.username || tweet.handle || 'user';

    return [
      {
        id: 'hide',
        icon: 'fa-eye-slash',
        label: 'Hide this tweet',
        handler: () => this.handleHide(tweet)
      },
      {
        id: 'block',
        icon: 'fa-ban',
        label: `Block ${username}`,
        handler: () => this.handleBlock(tweet)
      },
      {
        id: 'report',
        icon: 'fa-flag',
        label: 'Report tweet',
        handler: () => this.handleReport(tweet)
      },
      {
        id: 'info',
        icon: 'fa-circle-info',
        label: 'Show info',
        handler: () => this.handleShowInfo(tweet)
      }
    ];
  }

  handleHide(tweet) {
    if (typeof this.mod.hideTweet === 'function') {
      this.mod.hideTweet(tweet);
      return;
    }

    alert('Awaiting implementation...');
  }

  handleBlock(tweet) {
    if (typeof this.mod.blockUser === 'function') {
      this.mod.blockUser(tweet);
      return;
    }

    alert('Awaiting implementation...');
  }

  handleReport(tweet) {
    if (typeof this.mod.reportTweet === 'function') {
      this.mod.reportTweet(tweet);
      return;
    }

    alert('Awaiting implementation...');
  }

  handleShowInfo(tweet) {
    if (typeof this.mod.showTweetInfo === 'function') {
      this.mod.showTweetInfo(tweet);
      return;
    }

    alert('Awaiting implementation...');
  }

  positionMenu() {
    if (!this.menuEl || !this.anchor) {
      return;
    }

    const margin = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const anchorRect = this.anchor.getBoundingClientRect();

    this.menuEl.style.visibility = 'hidden';
    this.menuEl.style.top = '0px';
    this.menuEl.style.left = '0px';

    const menuRect = this.menuEl.getBoundingClientRect();

    let top = anchorRect.bottom + margin;
    let left = anchorRect.right - menuRect.width;

    if (top + menuRect.height > viewportHeight - margin) {
      top = anchorRect.top - menuRect.height - margin;
    }

    if (top < margin) {
      top = margin;
    }

    if (left < margin) {
      left = margin;
    }

    if (left + menuRect.width > viewportWidth - margin) {
      left = viewportWidth - menuRect.width - margin;
    }

    this.menuEl.style.top = `${Math.round(top)}px`;
    this.menuEl.style.left = `${Math.round(left)}px`;
    this.menuEl.style.visibility = '';
  }

  attachMenuEvents() {
    if (!this.menuEl) {
      return;
    }

    this.menuEl.querySelectorAll('.tweet-menu-item').forEach((button) => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const actionId = button.getAttribute('data-action');
        const action = this.actions.find((item) => item.id === actionId);

        this.close();

        if (action?.handler) {
          action.handler();
        }
      });
    });
  }

  addDismissListeners() {
    document.addEventListener('mousedown', this.onDocumentPointerDown, true);
    document.addEventListener('touchstart', this.onDocumentPointerDown, true);
    document.addEventListener('keydown', this.onDocumentKeyDown);

    const scroller =
      document.querySelector('.manager-body')?.closest('.manager') ||
      document.querySelector('.manager') ||
      document.querySelector('#saito-container') ||
      document.querySelector('.saito-container');

    if (scroller) {
      scroller.addEventListener('scroll', this.onScrollClose, { passive: true });
      this.scrollContainer = scroller;
    }
  }

  removeDismissListeners() {
    document.removeEventListener('mousedown', this.onDocumentPointerDown, true);
    document.removeEventListener('touchstart', this.onDocumentPointerDown, true);
    document.removeEventListener('keydown', this.onDocumentKeyDown);

    if (this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.onScrollClose);
      this.scrollContainer = null;
    }
  }

  onDocumentPointerDown(e) {
    if (!this.isOpen) {
      return;
    }

    const target = e.target;

    if (this.menuEl?.contains(target)) {
      return;
    }

    if (this.anchor?.contains(target)) {
      return;
    }

    this.close();
  }

  onDocumentKeyDown(e) {
    if (!this.isOpen || e.key !== 'Escape') {
      return;
    }

    e.preventDefault();
    this.close();
  }

  onScrollClose() {
    if (this.isOpen) {
      this.close();
    }
  }
}

module.exports = TweetMenu;
