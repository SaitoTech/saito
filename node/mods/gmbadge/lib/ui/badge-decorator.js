'use strict';

const BadgeSVG = require('../badge-svg');

//
// Watches the DOM for `.saito-address[data-id]` elements, the shared
// username markup that Red Square, Chat, Arcade, profiles and the
// SaitoUser component all render through `browser.returnAddressHTML`,
// and draws the holder's badge right after their name.
// One badge, every surface.
//
// Animation budget. Legendary and Exotic rims are animated SVG gradients.
// Each animating rim costs main-thread style and paint work every frame,
// so a long feed must not animate all of them. We do what the big
// platforms do with animated avatars and emotes:
//   - only rims inside the viewport animate (IntersectionObserver)
//   - at most MAX_LIVE animate at once; the rest hold a still frame
//   - everything pauses when the tab is hidden
//   - prefers-reduced-motion, slow-update screens and data saver get stills
// Rims outside the budget are rendered as truly static markup (gradient
// frozen, no animation element in the document) and the animated markup is
// swapped in only while a rim is live. Live rims get their own compositor
// layer so their repaint stays inside the 18px badge instead of dirtying the
// whole viewport.
//
const MAX_LIVE = 24;

class BadgeDecorator {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.observer = null;
    this.viewport = null;
    this.scheduled = false;
    this.visible = new Set(); // animated svgs currently in view
    this.live = new Set(); // animated svgs currently playing
    this.motion_ok = true;
    this.bound = false;
  }

  start() {
    if (this.observer || typeof document === 'undefined' || !document.body) {
      return;
    }
    this.motion_ok = this.motionAllowed();
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(document.body, { childList: true, subtree: true });

    if (typeof IntersectionObserver === 'function') {
      this.viewport = new IntersectionObserver((entries) => this.onViewport(entries), {
        rootMargin: '64px'
      });
    }
    if (!this.bound) {
      this.bound = true;
      document.addEventListener('visibilitychange', () => this.applyBudget());
      const mq = (q) => {
        try {
          const m = window.matchMedia(q);
          const h = () => {
            this.motion_ok = this.motionAllowed();
            this.applyBudget();
          };
          if (m.addEventListener) {
            m.addEventListener('change', h);
          } else if (m.addListener) {
            m.addListener(h);
          }
        } catch (err) {}
      };
      mq('(prefers-reduced-motion: reduce)');
      mq('(update: slow)');
    }
    this.schedule();
  }

  motionAllowed() {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return false;
      }
      if (window.matchMedia('(update: slow)').matches) {
        return false;
      }
      if (navigator.connection && navigator.connection.saveData) {
        return false;
      }
    } catch (err) {}
    return true;
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.viewport) {
      this.viewport.disconnect();
      this.viewport = null;
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
    document.querySelectorAll('.gm-badge-inline').forEach((el) => this.remove(el));
    document.querySelectorAll('.gm-decorated').forEach((el) => {
      el.classList.remove('gm-decorated');
    });
    this.schedule();
  }

  remove(el) {
    this.visible.delete(el);
    this.live.delete(el);
    if (this.viewport) {
      this.viewport.unobserve(el);
    }
    el.remove();
  }

  decorateAll() {
    const addresses = document.querySelectorAll('.saito-address[data-id]:not(.gm-decorated)');
    addresses.forEach((el) => this.decorate(el));
    this.applyBudget();
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
    const opts = {
      tier: v.tier,
      streak: v.streak,
      serial: v.serial,
      cracked: v.cracked,
      dormant: v.dormant,
      size: 18,
      label: false,
      rim: 'still'
    };
    span.__gmOpts = opts;
    span.innerHTML = BadgeSVG.render(opts);
    span.title = v.cracked
      ? `gm streak broken (was ${v.lost_streak})`
      : `gm streak ${v.streak} · ${v.tier.label}${v.serial != null ? ` · #${v.serial}` : ''}`;
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.location.href = `/gmbadge?key=${encodeURIComponent(publickey)}`;
    });
    address.insertAdjacentElement('afterend', span);

    const svg = span.querySelector('svg');
    if (svg && svg.getAttribute('data-rim')) {
      if (this.viewport) {
        this.viewport.observe(span);
      } else {
        this.visible.add(span);
      }
    }
  }

  onViewport(entries) {
    for (const e of entries) {
      if (e.isIntersecting) {
        this.visible.add(e.target);
      } else {
        this.visible.delete(e.target);
      }
    }
    this.applyBudget();
  }

  //
  // Decide which animated rims play: in view, tab visible, motion allowed,
  // and no more than MAX_LIVE. Earlier in document order wins, which keeps
  // the choice stable while scrolling.
  //
  applyBudget() {
    const allow =
      this.motion_ok && typeof document !== 'undefined' && document.visibilityState !== 'hidden';
    const candidates = allow
      ? Array.from(this.visible)
          .filter((span) => span.isConnected)
          .sort((a, b) =>
            a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
          )
          .slice(0, MAX_LIVE)
      : [];
    const next = new Set(candidates);
    for (const span of this.live) {
      if (!next.has(span)) {
        this.setRim(span, false);
      }
    }
    for (const span of next) {
      if (!this.live.has(span)) {
        this.setRim(span, true);
      }
    }
    this.live = next;
  }

  //
  // Swap the badge markup between still and animated. The still version has
  // no animation element at all, so it costs nothing per frame.
  //
  setRim(span, live) {
    const opts = span.__gmOpts;
    if (!opts || !span.isConnected) {
      return;
    }
    span.innerHTML = BadgeSVG.render(Object.assign({}, opts, { rim: live ? 'smil' : 'still' }));
    span.classList.toggle('gm-live', live);
  }
}

module.exports = BadgeDecorator;
