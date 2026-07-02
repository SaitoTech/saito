const SaitoUserTemplate = require('./saito-user.template');

// Shared canvas 2D context for measuring rendered text width without touching layout.
let measureCanvasCtx = null;
function getMeasureContext() {
  if (!measureCanvasCtx) {
    measureCanvasCtx = document.createElement('canvas').getContext('2d');
  }
  return measureCanvasCtx;
}

function getElementFont(el) {
  const style = window.getComputedStyle(el);
  return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

// Finds the longest "prefix…suffix" truncation of `text` that fits within `maxWidth`
// (measured using el's font), falling back to the untruncated string if it already fits.
function truncateMiddleToFit(text, el, maxWidth) {
  const ctx = getMeasureContext();
  ctx.font = getElementFont(el);

  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = '…';
  let lo = 1;
  let hi = Math.floor(text.length / 2);
  let best = 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = `${text.slice(0, mid)}${ellipsis}${text.slice(-mid)}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return `${text.slice(0, best)}${ellipsis}${text.slice(-best)}`;
}

class SaitoUser {
  constructor(app, mod, container = '', publicKey = '', notice = '', fourthelem = '') {
    this.app = app;
    this.mod = mod;
    this.publicKey = publicKey;
    this.notice = notice;
    this.fourthelem = fourthelem;
    this.container = container;
    this.extra_classes = '';
    this.data_disable = false; // prevent click to open user-menu
    this._addressResizeObserver = null;
  }

  updateUserline(userline, title = '') {
    let qs = this.container + `> .saito-user-${this.publicKey} .saito-userline`;
    let elem = document.querySelector(qs);
    if (elem) {
      elem.innerHTML = userline;
      if (userline) {
        elem.classList.remove('hidden');
      } else {
        elem.classList.add('hidden');
        elem.removeAttribute('title');
      }

      if (title) {
        elem.setAttribute('title', title);
      } else {
        elem.removeAttribute('title');
      }
    }
  }

  /**
   * Like updateUserline(), but for public keys/addresses: shows the full address
   * when there's room, otherwise a "prefix…suffix" truncation sized to the
   * userline element's actual rendered width. Re-measures on resize so it adapts
   * across breakpoints instead of using a fixed slice length.
   */
  updateUserlineAddress(address = '') {
    let qs = this.container + `> .saito-user-${this.publicKey} .saito-userline`;

    if (this._addressResizeObserver) {
      this._addressResizeObserver.disconnect();
      this._addressResizeObserver = null;
    }

    const paint = () => {
      let elem = document.querySelector(qs);
      if (!elem) {
        return;
      }
      if (!address) {
        elem.textContent = '';
        elem.classList.add('hidden');
        elem.removeAttribute('title');
        return;
      }
      const maxWidth = elem.clientWidth;
      elem.textContent = maxWidth ? truncateMiddleToFit(address, elem, maxWidth) : address;
      elem.classList.remove('hidden');
      elem.setAttribute('title', address);
    };

    paint();

    let elem = document.querySelector(qs);
    if (elem && typeof ResizeObserver !== 'undefined') {
      this._addressResizeObserver = new ResizeObserver(() => paint());
      this._addressResizeObserver.observe(elem);
    }
  }

  updateAddress(address) {
    let qs = this.container + `> .saito-user-${this.publicKey} .saito-address`;
    if (document.querySelector(qs)) {
      document.querySelector(qs).innerHTML = address;
    }
  }

  render() {
    let qs = this.container + `> .saito-user-${this.publicKey}`;

    if (document.querySelector(qs)) {
      this.app.browser.replaceElementBySelector(SaitoUserTemplate(this), qs);
    } else {
      this.app.browser.addElementToSelector(SaitoUserTemplate(this), this.container);
    }
  }

  attachEvents() {}
}

module.exports = SaitoUser;
