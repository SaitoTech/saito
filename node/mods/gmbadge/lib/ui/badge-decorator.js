'use strict';

const BadgeSVG = require('../badge-svg');

//
// Watches the DOM for `.saito-address[data-id]` elements, the shared
// username markup that Red Square, Chat, Arcade, profiles and the
// SaitoUser component all render through `browser.returnAddressHTML`,
// and draws the holder's badge right after their name.
// One badge, every surface.
//
class BadgeDecorator {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.observer = null;
    this.scheduled = false;
  }

  start() {
    if (this.observer || typeof document === 'undefined' || !document.body) {
      return;
    }
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.schedule();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  schedule() {
    if (this.scheduled) {
      return;
    }
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      this.decorateAll();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  // Called after fresh streak data arrives: strip and redraw.
  refresh() {
    if (typeof document === 'undefined') {
      return;
    }
    document.querySelectorAll('.gm-badge-inline').forEach((el) => el.remove());
    document.querySelectorAll('.gm-decorated').forEach((el) => {
      el.classList.remove('gm-decorated');
    });
    this.schedule();
  }

  decorateAll() {
    const addresses = document.querySelectorAll('.saito-address[data-id]:not(.gm-decorated)');
    addresses.forEach((el) => this.decorate(el));
  }

  decorate(address) {
    const publickey = address.getAttribute('data-id');
    if (!publickey) {
      return;
    }
    address.classList.add('gm-decorated');

    const v = this.mod.viewFor(publickey);
    if (!v || (v.tier.id === 0 && !v.cracked)) {
      return;
    }

    const next = address.nextElementSibling;
    if (next && next.classList && next.classList.contains('gm-badge-inline')) {
      return;
    }

    const span = document.createElement('span');
    span.className = `gm-badge-inline gm-tier-${v.tier.id}${v.cracked ? ' gm-cracked' : ''}`;
    span.setAttribute('data-id', publickey);
    span.innerHTML = BadgeSVG.render({
      tier: v.tier,
      streak: v.streak,
      serial: v.serial,
      cracked: v.cracked,
      dormant: v.dormant,
      size: 18,
      label: false
    });
    span.title = v.cracked
      ? `gm streak broken (was ${v.lost_streak})`
      : `gm streak ${v.streak} · ${v.tier.label}${v.serial != null ? ` · #${v.serial}` : ''}`;
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.location.href = `/gmbadge?key=${encodeURIComponent(publickey)}`;
    });
    address.insertAdjacentElement('afterend', span);
  }
}

module.exports = BadgeDecorator;
