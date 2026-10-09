const Art = require('../art');
const MainTemplate = require('./main.template');
const styles = require('./styles');
const PaymentTemplate = require('./payment.template');

class RobotsUI {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.busy = false;
  }

  ensureStyles() {
    if (!document.getElementById('robots-style')) {
      const style = document.createElement('style');
      style.id = 'robots-style';
      style.textContent = styles;
      document.head.appendChild(style);
    }
  }

  async render() {
    this.ensureStyles();
    await this.mod.injectGameHTML(MainTemplate());
  }

  mount() {
    this.mod.hud.container = '.robots-hud';
    this.mod.hud.render();
    this.mod.playerbox.container = '.robots-player';
    this.mod.playerbox.render();
    this.mod.playerbox.updateAddress('SARAH CONNOR', 1);
    this.mod.playerbox.updateUserline('HUMAN RESISTANCE', 1);
    const avatar = document.querySelector('.robots-player .saito-identicon');
    if (avatar) {
      const image = Art.dataURI(Art.svg(48, 48, Art.sprite('sarah', 0, 0, 4)));
      if (avatar.tagName === 'IMG') avatar.src = image;
      else avatar.innerHTML = `<img src="${image}" alt="Sarah Connor">`;
    }
    this.attachEvents();
    this.update();
  }

  prepareDeathScene(state) {
    // Track a turn, not an object reference: saved game restoration replaces objects.
    const key =
      state.status === 'dead'
        ? `${this.mod.game.id}:${this.mod.game.state.session?.round}:${state.wave}:${state.turns}`
        : null;
    if (this.deathScene?.key === key) return;
    clearTimeout(this.deathTimer);
    cancelAnimationFrame(this.deathFrame);
    this.deathScene = key ? { key, ready: false } : null;
    if (!this.deathScene) return;
    const scene = this.deathScene;
    // Begin the pause after the fatal board has had a chance to paint.
    this.deathFrame = requestAnimationFrame(() => {
      if (this.deathScene !== scene) return;
      this.deathFrame = requestAnimationFrame(() => {
        if (this.deathScene !== scene) return;
        this.deathTimer = setTimeout(() => {
          if (this.deathScene !== scene) return;
          scene.ready = true;
          this.update();
        }, 2000);
      });
    });
  }

  update(message = '') {
    const state = this.mod.game.state?.run;
    const root = document.querySelector('.robots-game');
    if (!root || !state || !this.mod.browser_active) return;
    this.prepareDeathScene(state);
    const payment = this.mod.teleportPayments.pending;
    const stats = {
      score: state.score,
      best: this.mod.loadGamePreference('Robots_best') || 0,
      wave: state.wave,
      robots: state.robots.length,
      fires: state.fires.length,
      leaderboardPoints: state.leaderboardPoints || 0,
      leaderboardBest: this.mod.loadGamePreference('Robots_leaderboard_best') || 0
    };
    for (const [name, value] of Object.entries(stats)) {
      root.querySelectorAll(`[data-stat="${name}"]`).forEach((el) => {
        el.textContent = name.startsWith('leaderboard')
          ? String(value)
          : String(value).padStart(name === 'score' || name === 'best' ? 6 : 2, '0');
        if (value < 0) el.textContent = '-' + String(-value).padStart(5, '0');
      });
    }
    root.querySelector('[data-leaderboard-rank]').textContent = this.mod.leaderboard.rank() || '--';
    let board =
      '<defs><pattern id="robots-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#1a2b3d" stroke-width="1"/><rect x="11" y="11" width="1" height="1" fill="#253b4e"/></pattern></defs>';
    board += `<rect width="600" height="456" fill="#0a1421"/><rect width="600" height="456" fill="url(#robots-grid)"/>`;
    // A subtle target reticle makes Sarah easy to locate among the metal units.
    board += `<rect x="${state.player.x * 24 + 1}" y="${state.player.y * 24 + 1}" width="22" height="22" fill="#183e39" stroke="#58d8c1"/>`;
    for (const cell of state.fires) board += Art.sprite('fire', cell.x * 24, cell.y * 24, 2);
    for (const cell of state.robots) board += Art.sprite('robot', cell.x * 24, cell.y * 24, 2);
    const sarah = Art.sprite('sarah', state.player.x * 24, state.player.y * 24, 2);
    if (this.deathScene && !this.deathScene.ready) {
      board += `<g class="robots-death-sarah">${sarah}</g>`;
      board += `<g class="robots-flaming-death" transform="translate(${state.player.x * 24} ${state.player.y * 24})" aria-hidden="true">
        <g class="robots-death-flames">${Art.sprite('fire', -6, -12, 3)}</g>
        <g class="robots-death-embers" fill="#ffe0a0"><rect x="2" y="2" width="3" height="3"/><rect x="18" y="-4" width="2" height="2"/><rect x="11" y="-10" width="3" height="3"/></g>
      </g>`;
    } else {
      board += sarah;
    }
    const arena = root.querySelector('.arena');
    arena.innerHTML = Art.svg(600, 456, board);
    arena.querySelector('svg').setAttribute('role', 'img');
    arena
      .querySelector('svg')
      .setAttribute(
        'aria-label',
        `Sarah column ${state.player.x + 1}, row ${state.player.y + 1}. ${state.robots.length} Terminators and ${state.fires.length} fires.`
      );
    if (state.status !== 'playing' && (!this.deathScene || this.deathScene.ready)) {
      arena.insertAdjacentHTML(
        'beforeend',
        `<div class="wave-result"><p>${state.status === 'dead' ? 'SIGNAL LOST' : 'SECTOR SECURED'}</p><h2>${state.status === 'dead' ? 'TERMINATED' : 'WAVE CLEAR'}</h2><p>${state.status === 'dead' ? `FINAL SCORE ${state.score}` : `${state.fires.length} FIRES / BONUS +${state.bonus}`}</p><button type="button" data-action="${state.status === 'dead' ? 'new' : 'next'}">${state.status === 'dead' ? 'TRY AGAIN' : 'NEXT WAVE'}</button><p>${state.status === 'dead' ? 'SPACE / 0 / INS' : 'ENTER / SPACE'}</p></div>`
      );
    }
    root
      .querySelectorAll(
        '[data-dx], [data-action="safe"], [data-action="teleport"], [data-action="restart"], [data-action="new"], [data-action="next"]'
      )
      .forEach((el) => {
        el.disabled =
          (['safe', 'teleport'].includes(el.dataset.action) || el.dataset.dx !== undefined) &&
          state.status !== 'playing';
      });
    root.querySelector('[data-action="safe"]').innerHTML = payment
      ? ['submitted', 'confirmed'].includes(payment.status)
        ? 'USE PAID JUMP <span>[F / NUM DEL]</span>'
        : 'RETRY PAYMENT <span>[F / NUM DEL]</span>'
      : 'SAFE JUMP <span>[F / NUM DEL] 1 SAITO</span>';
    if (!message && payment)
      message = ['submitted', 'confirmed'].includes(payment.status)
        ? 'PAID JUMP READY - PRESS F'
        : 'PAYMENT NOT YET SENT - F RETRIES WITHOUT A NEW CHARGE. KEEP PLAYING.';
    this.mod.hud.updateStatus(
      `<div class="mission-status">${message || (state.status === 'playing' ? 'LURE. COLLIDE. SURVIVE.' : state.status === 'dead' ? 'THE FUTURE IS NOT SET.' : `BURN BONUS +${state.bonus}`)}</div>`
    );
    this.mod.playerbox.updateBody(
      `<div class="pilot-stats"><span>${state.status === 'dead' ? 'OFFLINE' : 'VITALS: STABLE'}</span><span>${state.kills} KILLS / ${state.turns} TURNS</span></div>`,
      1
    );
  }

  async resumePaidTeleport() {
    const payment = this.mod.teleportPayments.pending;
    if (
      payment &&
      ['submitted', 'confirmed'].includes(payment.status) &&
      this.mod.browser_active &&
      !this.busy
    ) {
      await this.act({ type: 'paid-safe', signature: payment.signature });
    }
  }

  async act(action) {
    if (this.busy || !this.mod.game.state?.run) return;
    this.busy = true;
    try {
      if (action.type === 'safe') {
        await this.mod.teleportPayments.buy((message) => this.confirmTeleportPayment(message));
      } else {
        this.mod.addMove('robots\t' + JSON.stringify(action));
        await this.mod.endTurn();
      }
    } catch (error) {
      console.warn('Terminator action failed:', error);
      const known = ['NO SAFE LANDING - NO PAYMENT SENT', 'NOT ENOUGH SAITO FOR TELEPORT AND FEE'];
      this.update(
        known.includes(error.message)
          ? error.message
          : this.mod.teleportPayments.pending
            ? 'PAYMENT UNCONFIRMED - F RETRIES WITHOUT A NEW CHARGE'
            : 'PAYMENT FAILED - NO SAFE JUMP. CHECK WALLET AND CONNECTION.'
      );
    } finally {
      this.busy = false;
    }
    if (action.type === 'safe') await this.resumePaidTeleport();
  }

  async resumeLevel() {
    if (this.busy || this.confirming) return;
    this.confirming = true;
    try {
      const tx = this.mod.levelSaves.latest;
      if (!tx) {
        this.update('NO SAVED LEVEL FOUND — CONNECT TO THE ARCHIVE AND TRY AGAIN');
        return;
      }
      const run = tx.returnMessage().checkpoint.run;
      const position = run.status === 'cleared' ? 'after' : 'at the start of';
      if (await sconfirm(`Resume ${position} level ${run.wave}? This replaces your current board.`)) {
        // Keep the chosen checkpoint stable if an Archive response arrives during the prompt.
        if (this.mod.levelSaves.restore(tx)) this.update('LEVEL RESTORED');
      }
    } finally {
      this.confirming = false;
    }
  }

  confirmTeleportPayment(message) {
    return new Promise((resolve) => {
      this.mod.overlay.show(PaymentTemplate(), () => resolve(false));
      const panel = document.querySelector('.robots-payment');
      panel.querySelector('[data-payment-message]').textContent = message;
      panel.querySelector('[data-payment-cancel]').onclick = () => this.mod.overlay.close();
      panel.querySelector('[data-payment-confirm]').onclick = () => {
        if (panel.querySelector('[data-payment-remember]').checked) {
          this.mod.saveGamePreference('Robots_skip_teleport_prompt', true);
        }
        resolve(true);
        this.mod.overlay.close();
      };
    });
  }

  attachEvents() {
    this.events?.abort();
    this.events = new AbortController();
    const { signal } = this.events;
    const root = document.querySelector('.robots-game');
    const arena = root.querySelector('.arena');
    const handleAction = async (action) => {
      if (action === 'leaderboard') return this.mod.leaderboard.show();
      if (action === 'rules') return this.mod.overlay.show(this.mod.returnGameRulesHTML());
      if (action === 'restart') {
        this.confirming = true;
        try {
          if (await sconfirm('Start a new run? Your current run will be replaced.'))
            await this.act({ type: 'new' });
        } finally {
          this.confirming = false;
        }
        return;
      }
      await this.act({ type: action });
    };
    root.addEventListener(
      'click',
      (event) => {
        if (this.confirming || this.busy) return;
        const button = event.target.closest('button');
        if (button) {
          if (button.disabled) return;
          if (button.dataset.dx !== undefined)
            this.act({
              type: 'move',
              dx: Number(button.dataset.dx),
              dy: Number(button.dataset.dy)
            });
          else handleAction(button.dataset.action);
          return;
        }
        const state = this.mod.game.state?.run;
        if (!event.target.closest('.arena svg') || !state || state.status !== 'playing') return;
        const rect = arena.querySelector('svg').getBoundingClientRect();
        const dx =
          Math.floor(((event.clientX - rect.left) / rect.width) * state.width) - state.player.x;
        const dy =
          Math.floor(((event.clientY - rect.top) / rect.height) * state.height) - state.player.y;
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) this.act({ type: 'move', dx, dy });
        arena.focus({ preventScroll: true });
      },
      { signal }
    );
    const keys = {
      q: [-1, -1],
      w: [0, -1],
      e: [1, -1],
      a: [-1, 0],
      s: [0, 0],
      d: [1, 0],
      z: [-1, 1],
      x: [0, 1],
      c: [1, 1],
      7: [-1, -1],
      8: [0, -1],
      9: [1, -1],
      4: [-1, 0],
      5: [0, 0],
      6: [1, 0],
      1: [-1, 1],
      2: [0, 1],
      3: [1, 1],
      arrowup: [0, -1],
      arrowdown: [0, 1],
      arrowleft: [-1, 0],
      arrowright: [1, 0],
      home: [-1, -1],
      pageup: [1, -1],
      end: [-1, 1],
      pagedown: [1, 1],
      ' ': [0, 0],
      '.': [0, 0],
      clear: [0, 0]
    };
    document.addEventListener(
      'keydown',
      (event) => {
        if (
          !this.mod.browser_active ||
          !root.isConnected ||
          this.confirming ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.target.closest(
            'input, textarea, select, [contenteditable="true"], .saito-overlay, .saito-header, .game-menu'
          ) ||
          this.mod.overlay.visible ||
          [...document.querySelectorAll('.saito-overlay')].some(
            (overlay) => overlay.getClientRects().length > 0
          )
        )
          return;
        const key = event.key.toLowerCase();
        const state = this.mod.game.state?.run;
        if (
          state?.status === 'dead' &&
          (key === ' ' || key === '0' || key === 'insert' || event.code === 'Numpad0')
        ) {
          event.preventDefault();
          if (!event.repeat && this.deathScene?.ready) this.act({ type: 'new' });
          return;
        }
        if (state?.status === 'cleared' && (key === 'enter' || key === ' ')) {
          event.preventDefault();
          if (!event.repeat) this.act({ type: 'next' });
          return;
        }
        // Preserve native keyboard activation of focused buttons (without auto-repeat).
        if (event.target.closest('button') && (key === ' ' || key === 'enter')) {
          if (event.repeat) event.preventDefault();
          return;
        }
        const riskyJump = key === 't' || key === '0' || event.code === 'Numpad0';
        const safeJump =
          key === 'f' || event.code === 'NumpadDecimal' ||
          (event.location === 3 && (key === '.' || key === 'delete' || key === 'decimal'));
        if (keys[key] || riskyJump || safeJump) {
          event.preventDefault();
          if (event.repeat) return;
          if (safeJump) handleAction('safe');
          else if (keys[key]) this.act({ type: 'move', dx: keys[key][0], dy: keys[key][1] });
          else handleAction(riskyJump ? 'teleport' : 'safe');
        }
      },
      { signal }
    );
  }
}
module.exports = RobotsUI;
