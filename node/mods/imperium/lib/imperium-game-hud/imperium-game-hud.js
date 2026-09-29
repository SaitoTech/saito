const GameHUD2 = require('../../../../lib/saito/ui/game-hud2/game-hud2');
const ImperiumGameHudTemplate = require('./imperium-game-hud.template');

class ImperiumGameHUD extends GameHUD2 {
  constructor(app, mod) {
    super(app, mod);
    this.header_message = '';
    this.status_message = '';
    this.status_timer = null;
  }

  render() {
    if (!this.mod.browser_active) {
      return;
    }

    if (!document.getElementById('game-hud2')) {
      this.app.browser.addElementToDom(ImperiumGameHudTemplate());
      this.drag_bound = false;
    }

    this.attachEvents();
    this.refreshHeader();
  }

  hide() {
    this.clearStatusTimer();
    this.status_message = '';
    super.hide();
  }

  updateHeader(message) {
    this.header_message = message == null ? '' : String(message);
    this.render();
    let instruction = document.querySelector('#game-hud2 .imperium-hud-instruction');
    if (instruction) {
      instruction.textContent = this.header_message;
    }
  }

  updateMenu(options, callback) {
    this.render();
    this.setInteractionMode('menu');
    super.updateMenu(options, callback);
    let region = this.interactionRegion();
    if (region && !region.dataset.menuClickBound) {
      region.dataset.menuClickBound = '1';
      region.addEventListener('mousedown', (e) => {
        if (e.target.closest('.option')) {
          e.stopPropagation();
        }
      });
    }
  }

  updatePanel(html) {
    this.render();
    this.setInteractionMode('panel');
    let region = this.interactionRegion();
    if (region) {
      region.innerHTML = html == null ? '' : String(html);
    }
  }

  updateAcknowledge(html, callback) {
    this.render();
    this.setInteractionMode('acknowledge');
    let region = this.interactionRegion();
    if (!region) {
      return;
    }
    region.innerHTML =
      '<div class="imperium-hud-ack">' +
      '<div class="imperium-hud-ack-body">' +
      (html == null ? '' : String(html)) +
      '</div>' +
      '<button type="button" class="imperium-hud-ack-button">ACKNOWLEDGE</button>' +
      '</div>';
    let button = region.querySelector('.imperium-hud-ack-button');
    if (button) {
      button.onclick = (e) => {
        e.stopPropagation();
        if (typeof callback === 'function') {
          callback();
        }
      };
    }
  }

  updateStatus(message, fadeout_time) {
    let next = message == null ? '' : String(message);
    let same = next === this.status_message;
    this.status_message = next;
    this.clearStatusTimer();
    super.updateStatus(message);

    let el = document.querySelector('#game-hud2 .hud-status');
    if (!el) {
      return;
    }

    let visible_text = el.textContent ? el.textContent.trim() : '';
    if (!visible_text) {
      el.classList.remove('is-visible');
      return;
    }

    if (!same || !el.classList.contains('is-visible')) {
      el.classList.remove('is-visible');
      void el.offsetWidth;
      el.classList.add('is-visible');
    }

    if (fadeout_time == null || fadeout_time === '') {
      return;
    }

    let ms = parseInt(fadeout_time, 10);
    if (isNaN(ms) || ms < 0) {
      return;
    }

    this.status_timer = setTimeout(() => {
      this.status_timer = null;
      el.classList.remove('is-visible');
    }, ms);
  }

  refreshHeader() {
    let faction = document.querySelector('#game-hud2 .imperium-hud-faction');
    let swatch = document.querySelector('#game-hud2 .imperium-hud-swatch');
    let instruction = document.querySelector('#game-hud2 .imperium-hud-instruction');
    if (instruction) {
      instruction.textContent = this.header_message;
    }
    if (!faction || !swatch) {
      return;
    }

    let player = this.mod.game && this.mod.game.player;
    let name = '';
    if (player && typeof this.mod.returnFaction === 'function') {
      try {
        name = this.mod.returnFaction(player) || '';
      } catch (err) {
        name = '';
      }
    }
    faction.textContent = name;
    swatch.className = 'imperium-hud-swatch' + (player ? ' p' + player : '');
  }

  setInteractionMode(mode) {
    let frame = document.querySelector('#game-hud2 .imperium-hud-frame');
    if (!frame) {
      return;
    }
    frame.classList.remove('is-menu', 'is-panel', 'is-acknowledge');
    frame.classList.add('is-' + mode);
  }

  interactionRegion() {
    return document.querySelector('#game-hud2 .imperium-hud-frame .hud-menu');
  }

  clearStatusTimer() {
    if (this.status_timer) {
      clearTimeout(this.status_timer);
      this.status_timer = null;
    }
  }

  // Existing call sites pass one HTML status plus an optional menu. Route that
  // pair onto the header, the floating announcement, or the fixed panel.
  preparePrompt(message) {
    let raw = message == null ? '' : String(message);
    let text = this.plainHudText(raw);
    let body = this.withoutFactionPrefix(text);
    let header = this.fittingFragment(body);
    if (body && body !== header) {
      this.updateStatus(body);
    } else {
      this.updateStatus('');
      this.writeOverlayStatus(raw);
    }
    this.updateHeader(header);
  }

  prepareIdle(message) {
    let raw = message == null ? '' : String(message);
    let text = this.plainHudText(raw);
    if (!text) {
      this.updateStatus('');
      this.updateHeader('');
      this.updateMenu([]);
      return;
    }
    if (this.isFlash(text)) {
      this.updateHeader('');
      this.updateMenu([]);
      this.updateStatus(text, 4500);
      return;
    }
    if (raw.indexOf('textchoice') === -1 && raw.indexOf('buildchoice') === -1 && this.isBoardInstruction(text)) {
      let body = this.withoutFactionPrefix(text);
      let header = this.fittingFragment(body);
      if (body && body !== header) {
        this.updateStatus(body);
      } else {
        this.updateStatus('');
        this.writeOverlayStatus(raw);
      }
      this.updateHeader(header);
      this.updateMenu([]);
      return;
    }
    this.updateStatus('');
    this.writeOverlayStatus(raw);
    this.updateHeader('');
    this.updateMenu([]);
    this.updatePanel(raw.trim().charAt(0) === '<' ? raw : '<div class="status-message">' + this.escapeHtml(text) + '</div>');
  }

  plainHudText(message) {
    let text = message == null ? '' : String(message);
    text = text.replace(/<[^>]*>/g, ' ');
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/\s+/g, ' ').trim();
    return text;
  }

  factionName() {
    try {
      if (!this.mod || !this.mod.game || !this.mod.game.player) {
        return '';
      }
      if (typeof this.mod.returnFaction !== 'function') {
        return '';
      }
      return this.mod.returnFaction(this.mod.game.player) || '';
    } catch (err) {
      return '';
    }
  }

  withoutFactionPrefix(text) {
    let value = text || '';
    let faction = this.factionName();
    if (faction && value.indexOf(faction) === 0) {
      let rest = value.substring(faction.length);
      if (/^\s*[:\-—]/.test(rest)) {
        value = rest.replace(/^[\s:—-]+/, '').trim();
      }
    }
    return value.replace(/:\s*$/, '').trim();
  }

  instructionFrom(text) {
    return this.withoutFactionPrefix(text);
  }

  fittingFragment(body) {
    let value = (body || '').replace(/:\s*$/, '').trim();
    if (!value) {
      return '';
    }
    if (this.fitsHeader(value)) {
      return value;
    }
    let parts = value.split(/(?<=[.!?])\s+/);
    for (let i = parts.length - 1; i >= 0; i--) {
      let part = parts[i].replace(/:\s*$/, '').trim();
      if (part && part.length < value.length && this.fitsHeader(part)) {
        return part;
      }
    }
    return '';
  }

  fitsHeader(message) {
    let value = message == null ? '' : String(message);
    if (!value) {
      return true;
    }
    let fallback = () => {
      let faction = this.factionName();
      let budget = 36 - Math.max(0, faction.length - 16);
      return value.length <= Math.max(18, budget);
    };
    if (!this.mod || !this.mod.browser_active || typeof document === 'undefined') {
      return fallback();
    }
    let heading = document.querySelector('#game-hud2 .imperium-hud-heading');
    let instruction = document.querySelector('#game-hud2 .imperium-hud-instruction');
    if (!heading || !instruction || !heading.clientWidth) {
      return fallback();
    }
    let previous = instruction.textContent;
    instruction.textContent = value;
    let fits = heading.scrollWidth <= heading.clientWidth + 1;
    instruction.textContent = previous;
    return fits;
  }

  isFlash(text) {
    return /scoring completed|submitted\.\.\.|Hits taken|Notifying players|discarding\.\.\.|ending turn|Skipping purchase|trade offer submitted|Activating Fleet|suicide assault|Quashing Agenda|Waiting for information|being notified/i.test(text);
  }

  isBoardInstruction(text) {
    let header = this.instructionFrom(text);
    if (!header) {
      return false;
    }
    return /^(Select|Assign|Retreat|Unload|Remove |Add |Which|Make |Gain |Spend |Pick |Choose |How )/.test(header);
  }

  writeOverlayStatus(message) {
    let html = message == null ? '' : String(message);
    document.querySelectorAll('.zoom-overlay .status, .saito-overlay .status').forEach((el) => {
      el.innerHTML = html;
    });
  }

  escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

module.exports = ImperiumGameHUD;
