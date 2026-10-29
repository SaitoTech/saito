const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { decision, selected, hasPending } = require('../decision');

const PUBLIC_EVENTS = [
  'formosan',
  'redscare_player1',
  'redscare_player2',
  'containment',
  'degaulle',
  'nato',
  'nato_westgermany',
  'nato_france',
  'marshall',
  'warsawpact',
  'unintervention',
  'usjapan',
  'norad',
  'vietnam_revolts',
  'china_card',
  'china_card_facedown',
  'northseaoil',
  'johnpaul',
  'brezhnev',
  'wwby',
  'willybrandt',
  'shuttlediplomacy',
  'deathsquads',
  'campdavid',
  'cubanmissilecrisis',
  'saltnegotiations',
  'missileenvy',
  'missile_envy',
  'flowerpower',
  'beartrap',
  'quagmire',
  'awacs',
  'starwars',
  'teardown',
  'iranianhostage',
  'ironlady',
  'reformer',
  'evilempire',
  'yuri',
  'chernobyl'
];

// Reuse Twilight's card and country callbacks in an isolated, local DOM.
// No Chromium, remote assets, page scripts or browser networking are used.
class TwilightRunner {
  constructor(mod) {
    this.mod = mod;
    this.menu = [];
    this.cards = [];
    this.revision = 0;
    this.rejected = new Set();
    const html = require('../../../mods/twilight/lib/core/game-html.template').default;
    this.dom = new JSDOM(
      html(mod.app, mod) + '<div id="runner-menu"></div><div class="saito-overlay"></div>',
      { runScripts: 'outside-only', url: 'https://runner.invalid/' }
    );
    const window = this.dom.window;
    window.eval(
      fs.readFileSync(
        path.resolve(__dirname, '../../../web/saito/lib/jquery/jquery-3.2.1.min.js'),
        'utf8'
      )
    );
    this.$ = window.$;
    global.window = window;
    global.document = window.document;
    global.$ = window.$;
    global.salert = (message) => {
      this.notice = this.plain(message);
      return Promise.resolve();
    };
    global.sconfirm = (message) =>
      new Promise((resolve) => {
        this.confirm = { message: this.plain(message), resolve };
      });
    mod.displayModal = (title, text) => {
      this.notice = this.plain(title + ': ' + (text || ''));
    };
    mod.hud.updateStatus = (message) => {
      this.status = this.plain(message);
      mod.game.status = message;
    };
    mod.hud.updateCards = (cards) => {
      this.cards = [...(cards || [])];
    };
    mod.hud.updateMenu = (items, callback) => {
      this.menu = items || [];
      this.menuCallback = callback;
      if (this.menu.length) this.cardCallback = null;
      const root = window.document.getElementById('runner-menu');
      root.replaceChildren();
      for (const item of this.menu) {
        const el = window.document.createElement('div');
        el.className = 'option';
        el.id = item.id;
        el.textContent = item.label;
        root.append(el);
      }
    };
    mod.cardbox.bindCallback = (callback) => {
      this.cardCallback = callback;
    };
    mod.hud.attachControlCallback = (callback) => {
      this.menuCallback = callback;
    };
    mod.overlay.show = (html) => {
      window.document.querySelector('.saito-overlay').innerHTML = html;
    };
    mod.overlay.hide = mod.overlay.close = () => {
      window.document.querySelector('.saito-overlay').replaceChildren();
    };
    for (const name of [
      'scoring_overlay',
      'war_overlay',
      'headline_overlay',
      'deck_overlay',
      'stats_overlay',
      'zoom_overlay',
      'minimap'
    ]) {
      const component = mod[name];
      if (!component) continue;
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(component)))
        if (key !== 'constructor' && typeof component[key] === 'function')
          component[key] = () => {};
    }
    mod.showInfluence = (country, player, callback) => {
      if (callback) callback();
    };
    for (const name of [
      'displayBoard',
      'updateEventTiles',
      'hideCard',
      'showCard',
      'showMinimapMarker'
    ])
      mod[name] = () => {};
    const handle = mod.handleGameLoop.bind(mod);
    mod.handleGameLoop = (...args) => {
      const { runnerTwilight, runnerTwilightWait, ...game } = mod.game;
      this.candidate = JSON.parse(JSON.stringify({ game, moves: mod.moves }));
      delete mod.game.runnerTwilight;
      delete mod.game.runnerTwilightWait;
      const result = handle(...args);
      // A paused card may already have changed VP, DEFCON or influence, even
      // when the opponent owns the next choice. Rebuild from BEFORE that card.
      if (result === 0 && !mod.game.over) {
        if (this.sending) mod.game.runnerTwilightWait = true;
        else mod.game.runnerTwilight = { base: this.candidate, actions: [] };
      }
      return result;
    };
    const send = mod.sendGameMoveTransaction.bind(mod);
    mod.sendGameMoveTransaction = (...args) => {
      this.cardCallback = null;
      this.menuCallback = null;
      if (args[0] === 'game') {
        mod.game.runnerDraft = { turn: [...mod.game.turn] };
        mod.saveGame(mod.game.id);
      }
      this.sending = Promise.resolve(send(...args))
        .catch((error) => {
          this.failure = error;
          throw error;
        })
        .finally(() => {
          this.sending = null;
        });
      return this.sending;
    };
  }
  plain(value) {
    return String(value || '')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  stateKey() {
    const m = this.mod,
      g = m.game;
    return JSON.stringify([
      g.step,
      g.queue,
      g.countries,
      g.deck?.[0]?.hand,
      m.moves,
      this.status,
      this.menu,
      this.cards
    ]);
  }
  current() {
    const m = this.mod,
      g = m.game;
    if (this.failure) throw this.failure;
    if (
      !g?.state ||
      g.over ||
      g.initializing ||
      this.sending ||
      hasPending(m) ||
      (this.task && !this.confirm)
    )
      return null;
    const key = this.stateKey();
    if (key !== this.lastKey) {
      this.rejected.clear();
      this.lastKey = key;
    }
    const actions = [];
    const add = (kind, value, label, score = 0) => {
      const action = { kind, value };
      if (!this.rejected.has(JSON.stringify(action)))
        actions.push({ action, label: this.plain(label || value), score });
    };
    if (this.confirm) {
      add('confirm', false, 'No', 1);
      add('confirm', true, 'Yes');
    } else {
      if (this.menuCallback)
        for (const item of this.menu) add('menu', item.id, item.label, this.menuScore(item.id));
      if (this.cardCallback)
        for (const card of this.cards) {
          if (/headline/i.test(this.status) && ['china', 'unintervention'].includes(card)) continue;
          add('card', card, m.returnAllCards(true)[card]?.name, this.cardScore(card));
        }
      for (const el of this.dom.window.document.querySelectorAll(
        '.country, .option, .saito-overlay .card'
      )) {
        if (!el.id || !this.handlers(el).length || !this.visible(el)) continue;
        if (el.classList.contains('country')) {
          const c = g.countries[el.id];
          if (!c) continue;
          if (
            this.handlers(el).some((h) => /\.place\s*(?:==|!=)/.test(h.toString())) &&
            c.place !== 1
          )
            continue;
          const removing = this.status.match(/remov.*?\b(USSR|US) influence/i);
          if (removing && c[removing[1].toLowerCase()] <= 0) continue;
          add('country', el.id, c.name, this.countryScore(c));
        } else if (!this.menuCallback || !el.classList.contains('option'))
          add('element', el.id, el.textContent || el.id);
      }
    }
    if (!actions.length) {
      if (this.rejected.size) throw Error('Twilight has no usable targets: ' + this.status);
      return null;
    }
    const s = g.state;
    // Public board + own hand only: no dice, deck keys, blind picks or wallet.
    const observation = {
      game: 'Twilight Struggle',
      seat: g.player,
      faction: m.roles[g.player],
      phase: this.confirm?.message || this.status,
      round: s.round,
      turn: s.turn,
      actionRound: s.turn_in_round,
      vp: s.vp,
      defcon: s.defcon,
      events: Object.fromEntries(
        PUBLIC_EVENTS.filter((key) => s.events?.[key] !== undefined).map((key) => [
          key,
          s.events[key]
        ])
      ),
      space: { us: s.space_race_us, ussr: s.space_race_ussr },
      militaryOps: { us: s.milops_us, ussr: s.milops_ussr },
      countries: Object.fromEntries(
        Object.entries(g.countries).map(([id, c]) => [
          id,
          {
            name: c.name,
            us: c.us,
            ussr: c.ussr,
            control: c.control,
            bg: c.bg,
            region: c.region,
            neighbours: c.neighbours
          }
        ])
      ),
      hand: g.deck[0].hand.map((id) => ({ id, ...m.returnAllCards(true)[id] })),
      notice: this.notice || ''
    };
    return decision(g.id, this.revision, observation, actions);
  }
  visible(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.style.display === 'none') return false;
    }
    return true;
  }
  target(kind, value) {
    const selector = kind === 'country' ? '.country' : '.option, .saito-overlay .card';
    return [...this.dom.window.document.querySelectorAll(selector)].find(
      (el) => el.id === value && this.visible(el) && this.handlers(el).length
    );
  }
  handlers(el) {
    return [
      ...(this.$._data(el, 'events')?.click || this.$._data(el, 'events')?.mouseup || []).map(
        (x) => x.handler
      ),
      ...(typeof el.onclick === 'function' ? [el.onclick] : [])
    ];
  }
  menuScore(id) {
    if (
      id === 'coup' &&
      Number(this.mod.game.state.events?.cubanmissilecrisis) === this.mod.game.player
    )
      return -100;
    if (id === 'space' && this.mod.game.state.defcon <= 2) return 60;
    if (id === 'participate') return 10;
    return (
      {
        event: 20,
        ops: 10,
        place: 30,
        space: 5,
        coup: 0,
        realign: -5,
        skipturn: 5,
        discard: 10,
        remove: 0,
        before: 10,
        after: 0
      }[id] || 0
    );
  }
  cardScore(id) {
    const m = this.mod,
      c = m.returnAllCards(true)[id];
    if (!c) return 0;
    const own = c.player === m.roles[m.game.player] || c.player === 'both';
    return c.scoring ? 100 : (own ? 20 : 0) + (c.ops || 0) - (id === 'china' ? 100 : 0);
  }
  countryScore(c) {
    const me = this.mod.roles[this.mod.game.player],
      other = me === 'us' ? 'ussr' : 'us';
    if (/remove|removing|eliminate/i.test(this.status)) {
      const target = this.status.match(/\b(USSR|US) influence/i)?.[1].toLowerCase() || other;
      return c[target] * 5 + (target === me ? -1 : 1) * c.bg * 3;
    }
    const need = c.control + c[other] - c[me];
    return (need > 0 ? 20 : -20) + c.bg * 10 - Math.abs(need);
  }
  async submit(id, choiceId) {
    const choice = selected(this.current(), id, choiceId);
    const g = this.mod.game;
    if (!g.runnerTwilight && this.candidate)
      g.runnerTwilight = { base: this.candidate, actions: [] };
    this.mod.saveGame(g.id);
    await this.execute(choice.action);
    if (g.runnerTwilight) g.runnerTwilight.actions.push(choice.action);
    this.mod.saveGame(g.id);
  }
  async sendDraft() {
    const m = this.mod;
    m.game.turn = [...m.game.runnerDraft.turn];
    m.moves = [];
    await m.sendGameMoveTransaction('game', {});
  }
  async restore() {
    const m = this.mod,
      saved = m.game,
      checkpoint = saved.runnerTwilight;
    if (saved.runnerTwilightWait && !saved.runnerDraft) {
      m.initializeGame(m.game.id);
      m.initialize_game_run = m.game.initialize_game_run = 1;
      m.gaming_active = 0;
      return;
    }
    if (saved.runnerDraft) {
      m.countries = m.game.countries;
      await this.sendDraft();
      return;
    }
    if (JSON.stringify(saved.step) !== JSON.stringify(checkpoint.base.game.step)) {
      throw Error('Twilight checkpoint crossed a network step; refusing unsafe replay');
    }
    m.game = JSON.parse(JSON.stringify(checkpoint.base.game));
    m.moves = [...checkpoint.base.moves];
    m.initializeGame(m.game.id);
    m.initialize_game_run = m.game.initialize_game_run = 1;
    m.handleGameLoop();
    for (const action of checkpoint.actions) await this.execute(action);
    m.game.runnerTwilight = checkpoint;
    m.game.future = saved.future;
    m.gaming_active = 0;
    m.saveGame(m.game.id);
  }
  async execute(action) {
    const before = this.stateKey();
    this.notice = '';
    const { kind, value } = action;
    let result;
    if (kind === 'confirm') {
      const c = this.confirm;
      this.confirm = null;
      c.resolve(value);
      result = this.task;
    } else if (kind === 'menu') result = this.menuCallback(value);
    else if (kind === 'card') result = this.cardCallback(value);
    else {
      const el = this.target(kind, value);
      if (!el) throw Error('Decision target disappeared');
      const handlers = this.handlers(el);
      for (const handler of handlers)
        result = handler.call(el, {
          currentTarget: el,
          target: el,
          clientX: 0,
          clientY: 0,
          preventDefault() {},
          stopPropagation() {}
        });
    }
    if (result?.then) {
      this.task = Promise.resolve(result)
        .catch((error) => {
          this.failure = error;
        })
        .finally(() => {
          this.task = null;
        });
      await Promise.race([this.task, new Promise((r) => setTimeout(r, 0))]);
    }
    if (this.sending) await this.sending;
    if (before === this.stateKey() && !this.confirm) this.rejected.add(JSON.stringify(action));
    this.revision++;
  }
}
module.exports = TwilightRunner;
