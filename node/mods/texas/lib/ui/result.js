const ResultTemplate = require('./result.template');

class Result {
  // Authoritative auto-acknowledge duration. Shot clock and display share this.
  static ACKNOWLEDGE_MS = 3000;

  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.countdown_timer = null;
    this.deadline = 0;
  }

  render() {
    if (!this.mod.gameBrowserActive() && !this.mod.browser_active) {
      return;
    }
    if (!document.querySelector('.texas-result')) {
      this.app.browser.addElementToSelector(ResultTemplate(), '.texas-table');
    }
  }

  show(opts = {}) {
    this.render();
    let host = document.getElementById('texas-result');
    if (!host) {
      return;
    }

    let cards_el = document.getElementById('texas-result-cards');
    let headline_el = document.getElementById('texas-result-headline');
    let hand_el = document.getElementById('texas-result-hand');
    let cards = Array.isArray(opts.cards) ? opts.cards.filter(Boolean) : [];

    if (cards_el) {
      cards_el.innerHTML = cards
        .map((card) => {
          let name = String(card).replace(/\.png$/i, '');
          return `<img class="card" src="${this.mod.card_img_dir}/${name}.png" alt="">`;
        })
        .join('');
      cards_el.hidden = cards.length === 0;
    }
    if (headline_el) {
      headline_el.textContent = opts.headline || '';
    }
    if (hand_el) {
      hand_el.textContent = opts.hand || '';
      hand_el.hidden = !opts.hand;
    }

    host.hidden = false;
    host.classList.add('is-visible');
  }

  hide() {
    this.clearCountdown();
    let host = document.getElementById('texas-result');
    if (host) {
      host.classList.remove('is-visible');
      host.hidden = true;
    }
    let cards_el = document.getElementById('texas-result-cards');
    if (cards_el) {
      cards_el.innerHTML = '';
    }
  }

  // Bind the displayed countdown to the same deadline as setShotClock.
  startCountdown(ms = Result.ACKNOWLEDGE_MS) {
    this.clearCountdown();
    this.deadline = Date.now() + ms;
    this.tickCountdown();
    this.countdown_timer = setInterval(() => this.tickCountdown(), 200);
  }

  tickCountdown() {
    let el = document.getElementById('texas-result-countdown');
    if (!el || !this.deadline) {
      return;
    }
    let remaining = Math.ceil((this.deadline - Date.now()) / 1000);
    if (remaining <= 0) {
      el.textContent = '';
      this.clearCountdown();
      return;
    }
    el.textContent = `Next hand in ${remaining}`;
  }

  clearCountdown() {
    if (this.countdown_timer) {
      clearInterval(this.countdown_timer);
      this.countdown_timer = null;
    }
    this.deadline = 0;
  }

  formatHandName(name) {
    return String(name || '')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
}

module.exports = Result;
