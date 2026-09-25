/**
 * Presentation adapter for SettlersX.
 *
 * The copied Settlers rule modules remain the authority for legal choices and
 * network moves. An inert DOM board retains their selectors and event handlers;
 * WebGL picks dispatch the same events onto those legal targets. No renderer
 * callback manufactures a game command or changes resources / scores.
 */
module.exports = function installSettlersX(SettlersX) {
  const proto = SettlersX.prototype;
  const original = {};
  for (const name of ['displayBoard', 'displayPlayers', 'buildCity', 'buildRoad',
    'handleGameLoop', 'updateLog', 'endTurn']) original[name] = proto[name];

  proto.sxLoadAssets = async function () {
    for (const [src, globalName] of [
      ['/settlersx/js/vendor/three.min.js', 'THREE'],
      ['/settlersx/js/geometry.js', 'SettlersXGeometry'],
      ['/settlersx/js/scene.js', 'SettlersXScene'],
      ['/settlersx/js/ui.js', 'SettlersXUI']
    ]) {
      if (window[globalName]) continue;
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Unable to load ${src}`));
        document.head.appendChild(script);
      });
    }
  };

  /** Mount the real game UI; the standalone harness uses this same entry point. */
  proto.sxMount = function (container) {
    this.sxDestroy();
    this.status = this.status || [];
    document.body.classList.add('settlersx-game');
    this.sxUI = window.SettlersXUI.mount({ container, mode: this.sxMode || 'game', mod: this });
    for (const entry of (this.game.log || []).slice(0, 100).reverse()) this.sxUI.log(entry);

    const compat = document.createElement('div');
    compat.id = 'sx-compat';
    compat.setAttribute('aria-hidden', 'true');
    compat.setAttribute('inert', '');
    compat.style.cssText = 'display:none!important';
    compat.innerHTML = '<div class="main dark"></div>';
    container.appendChild(compat);
    this.hexgrid.render('#sx-compat .main');

    // displayScore is rule-bearing: keep its data contract, suppress only the
    // legacy visual track. The expedition roster reads the resulting scores.
    this.racetrack.win = this.game.options.game_length;
    this.racetrack.players = this.game.state.players.map((player, i) => ({
      name: this.game.playerNames[i], score: player.vp, color: this.game.colors[i]
    }));
    this.racetrack.render = () => {};
    this.racetrack.lock = () => {};

    this.hud.updateStatus = (html) => this.updateStatus(html);
    this.hud.updateControls = (html) => this.updateControls(html);
    this.hud.showPopup = (html, timeout) => this.sxShowPopup(html, timeout);
    this.hud.hidePopup = () => document.querySelector('.sx-event-popup')?.remove();
    this.cardfan.render = () => {};
    this.cardfan.hide = () => {};

    this.sxEnsureBoard();
    this.sxBindActions();
    this.updateControls();
    if (this.game.state.placedCity) {
      document.querySelectorAll('#sx-actions .option').forEach((el) => {
        el.style.visibility = 'hidden';
      });
    }
    this.sxObserver = new MutationObserver(() => this.sxScheduleRefresh());
    this.sxObserver.observe(compat, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class']
    });
    this.sxObserver.observe(document.getElementById('sx-actions'), {
      childList: true, subtree: true, attributes: true, attributeFilter: ['class']
    });
    this.sxRefresh();
    this.updateStatus(this.game.status || 'Preparing the expedition…');
    return this.sxUI;
  };

  proto.sxEnsureBoard = function () {
    if (!this.sxUI || !Object.keys(this.game.state.hexes || {}).length) return;
    if (!document.querySelector('#sx-compat .city')) {
      this.addCitiesToGameboard();
      this.addPortsToGameboard();
      original.displayBoard.call(this);
    }
  };

  proto.sxBindActions = function () {
    const bind = (id, callback) => {
      const el = document.getElementById(id);
      if (el) el.onclick = (event) => {
        if (!el.classList.contains('enabled')) return;
        callback(event);
      };
    };
    bind('score', () => this.stats_overlay.render());
    bind('playcard', () => this.dev_card.render());
    bind('bank', () => this.bank.render());
    bind('spend', () => this.build.render());
    bind('trade', () => {
      if (this.game.over || !this.game.player) return;
      const ad = this.game.state.ads[this.game.player - 1];
      if (ad?.offer || ad?.ask) {
        this.showTradeOverlay(this.game.player, ad.ask, ad.offer);
      } else this.trade_overlay.render();
    });
  };

  proto.sxScheduleRefresh = function () {
    if (!this.sxUI || this.sxRefreshFrame) return;
    this.sxRefreshFrame = requestAnimationFrame(() => {
      this.sxRefreshFrame = null;
      this.sxRefresh();
    });
  };

  proto.sxRefresh = function () {
    if (!this.sxUI) return;
    this.sxDecorateControls();
    this.sxUI.refresh();
    const scene = this.sxUI.scene;
    if (!scene) return;
    scene.setState(this.game.state, this.game.colors);
    const targets = [];
    document.querySelectorAll('#sx-compat .rhover, #sx-compat .chover').forEach((el) => {
      if (el.classList.contains('noselect') || el.classList.contains('bandit')) return;
      let kind;
      if (el.classList.contains('city')) kind = 'vertex';
      if (el.classList.contains('road')) kind = 'edge';
      if (el.classList.contains('sector-container')) kind = 'hex';
      if (kind) targets.push({ id: el.id, kind });
    });
    this.sxTargets = targets;
    scene.setTargets(targets);
  };

  // Original rules change action icons directly. Translate those writes into
  // visible, accessible labels while preserving their original event handlers.
  proto.sxDecorateControls = function () {
    const labels = {
      'fa-dice': 'Roll the dice', 'fa-pause': 'Waiting for explorers',
      'fa-xmark': 'Cancel build', 'fa-check': 'Confirm',
      'fa-rotate-left': 'Play again', 'fa-door-open': 'Leave expedition',
      'fa-anchor': 'Return to harbour'
    };
    document.querySelectorAll('#sx-actions .option').forEach((button) => {
      button.setAttribute('aria-disabled', String(!button.classList.contains('enabled')));
      const icon = button.querySelector('i');
      if (!icon) return;
      let label = Object.keys(labels).find((key) => icon.classList.contains(key));
      label = labels[label];
      if (icon.classList.contains('fa-forward')) {
        label = this.game.queue.at(-1)?.startsWith('player_actions') ? 'End turn' : 'Continue';
      }
      if (!label) return;
      button.innerHTML = `<span>${label}</span><b aria-hidden="true">↗</b>`;
      button.setAttribute('aria-label', label);
    });
  };

  proto.sxPick = function ({ id, kind }) {
    const prefix = kind === 'vertex' ? 'city_' : kind === 'edge' ? 'road_' : 'sector_value_';
    const domId = id.startsWith(prefix) ? id : prefix + id;
    if (!this.sxTargets?.some((target) => target.id === domId && target.kind === kind)) return;
    const target = document.getElementById(domId);
    if (!target || target.classList.contains('noselect')) return;
    // jQuery's original handlers use mouse down/up to reject camera drags.
    for (const type of ['mousedown', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 0, clientY: 0 }));
    }
    this.sxScheduleRefresh();
  };

  proto.updateStatus = function (html, preserve = 0) {
    if (this.lock_interface === 1) return;
    this.game.status = html;
    this.status = this.status || [];
    if (this.status.length && !this.status[this.status.length - 1][1]) this.status.pop();
    this.status.push([html, preserve]);
    this.status = this.status.slice(-3);
    const content = this.status.map(([line]) => line.includes('<div') ? line :
      `<div class="player-notice">${line}</div>`).join('');
    if (this.sxUI) this.sxUI.setStatus(content);
  };

  proto.updateLog = function (html, force = 0) {
    if (original.updateLog) original.updateLog.call(this, html, force);
    this.sxUI?.log(html);
  };

  proto.displayCardfan = function () { this.sxScheduleRefresh(); };

  for (const name of ['displayBoard', 'displayPlayers', 'buildCity', 'buildRoad']) {
    proto[name] = function (...args) {
      const result = original[name].apply(this, args);
      this.sxScheduleRefresh();
      return result;
    };
  }

  proto.handleGameLoop = async function (...args) {
    const command = this.game.queue[this.game.queue.length - 1]?.split('\t');
    try {
      const result = await original.handleGameLoop.apply(this, args);
      this.sxEnsureBoard();
      if (command && this.sxUI?.scene) {
        const animate = (type, payload) => this.sxUI.scene.animate(type, payload);
        const goods = (from, to, resource, count) => {
          if (Number(count) > 0 && this.returnResources().includes(resource)) {
            animate('trade', { from, to, resource, count: Number(count) });
          }
        };
        if (command[0] === 'bank') {
          const player = Number(command[1]), harbour = { x: -4.8, y: 0.4, z: 2.8 };
          goods(player, harbour, command[3], command[2]);
          goods(harbour, player, command[5], command[4]);
        }
        if (command[0] === 'accept_offer') {
          const accepting = Number(command[1]), offering = Number(command[2]);
          for (const [resource, count] of Object.entries(JSON.parse(command[3]))) goods(offering, accepting, resource, count);
          for (const [resource, count] of Object.entries(JSON.parse(command[4]))) goods(accepting, offering, resource, count);
        }
        if (command[0] === 'steal_card') goods(Number(command[2]), Number(command[1]), command[3], 1);
        const events = {
          move_bandit: 'robber', build_road: 'road', build_city: 'village',
          upgrade_city: 'city'
        };
        if (events[command[0]]) this.sxUI.scene.animate(events[command[0]], {
          player: Number(command[1]), slot: command[2], command,
          hex: command[2]?.replace('sector_value_', '')
        });
      }
      return result;
    } finally { this.sxScheduleRefresh(); }
  };

  proto.endTurn = function (...args) {
    this.sxUI?.scene?.setTargets([]);
    this.sxTargets = [];
    return original.endTurn.apply(this, args);
  };

  proto.sxShowPopup = function (html, timeout = 3500) {
    document.querySelector('.sx-event-popup')?.remove();
    const popup = document.createElement('aside');
    popup.className = 'sx-event-popup';
    popup.setAttribute('role', 'status');
    popup.innerHTML = html;
    popup.style.cssText = 'position:fixed;top:100px;left:50%;transform:translateX(-50%);z-index:1000;max-width:min(420px,90vw)';
    popup.addEventListener('click', () => popup.remove());
    document.body.appendChild(popup);
    if (timeout) setTimeout(() => popup.remove(), timeout);
  };

  proto.confirmPlacement = function (slot, piece, callback) {
    this.stopPlacementHintWave();
    const preference = this.loadGamePreference('settlers_confirm_moves');
    if (preference != null) this.confirm_moves = preference;
    if (this.confirm_moves == 0) { callback(); return; }
    document.querySelector('.popup-confirm-menu')?.remove();
    const popup = document.createElement('div');
    popup.className = 'popup-confirm-menu sx-placement-confirm';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', `Place ${piece}`);
    popup.innerHTML = `<div class="popup-prompt">Place ${piece} here?</div>
      <button type="button" class="action" id="confirm">Build ${piece}</button>
      <button type="button" class="action" id="stopasking">Build &amp; remember</button>
      <button type="button" class="action" id="sx-cancel-placement">Choose another spot</button>`;
    popup.style.cssText = 'position:fixed;bottom:160px;left:50%;transform:translateX(-50%);z-index:1100';
    popup.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      popup.remove();
      if (button.id === 'sx-cancel-placement') return;
      if (button.id === 'stopasking') {
        this.confirm_moves = 0;
        this.saveGamePreference('settlers_confirm_moves', 0);
      }
      callback();
      this.sxScheduleRefresh();
    });
    document.body.appendChild(popup);
    popup.querySelector('button').focus();
  };

  // Retain the framework animation queue contract: resource collection pauses
  // the game until the final queued visual completes, then restarts it once.
  proto.sxQueueAnimation = function (type, payload) {
    this.animationSequence.push({
      callback: function () {
        this.sxPendingAnimations = (this.sxPendingAnimations || 0) + 1;
        this.sxUI?.scene?.animate(type, payload);
        setTimeout(() => {
          this.sxPendingAnimations--;
          this.sxScheduleRefresh();
          if (!this.sxPendingAnimations && !this.animationSequence.length) this.restartQueue();
        }, 850);
      }, params: []
    });
  };

  proto.animateHarvest = function (player, resource, tile = null) {
    this.sxQueueAnimation('harvest', { player, resource, hex: tile, tile });
  };
  proto.animateDevCard = function (player) {
    if (player === this.game.player) this.sxUI?.scene?.animate('trade', { player, resource: 'devcard' });
    else {
      this.sxQueueAnimation('trade', { player, resource: 'devcard' });
      this.runAnimationQueue(250);
    }
  };
  proto.animateDiceRoll = function (roll) {
    this.sxUI?.scene?.animate('dice', { roll, dice: this.game.state.lastroll });
    this.sxScheduleRefresh();
  };

  // Scene targets provide the placement hint pulse without invisible DOM timers.
  proto.startPlacementHintWave = function () { this.sxScheduleRefresh(); };
  proto.stopPlacementHintWave = function () {};

  proto.sxDestroy = function () {
    this.sxObserver?.disconnect();
    if (this.sxRefreshFrame) cancelAnimationFrame(this.sxRefreshFrame);
    this.sxRefreshFrame = null;
    this.sxUI?.destroy();
    this.sxUI = null;
    document.getElementById('sx-compat')?.remove();
    document.querySelector('.popup-confirm-menu')?.remove();
  };

  proto.returnImage = function () { return '/settlersx/img/cover.svg'; };
  proto.returnBanner = function () { return '/settlersx/img/cover.svg'; };
};
