const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { decision, selected, hasPending } = require('../decision');

class ConfirmationRequired extends Error {}

// Known public event markers, deliberately excluding future/unknown state fields.
const PUBLIC_EVENTS = [
  'albania',
  'austria',
  'backs_to_the_wall',
  'belgium',
  'blockade',
  'blucher',
  'bolshevik_revolution',
  'bolshevik_ru_rp_turn',
  'brusilov_offensive',
  'bulgaria',
  'central_total_war_cards_added',
  'convoy',
  'egypt',
  'eleventh_army',
  'england',
  'entrench',
  'everyone_into_battle',
  'falkenhayn',
  'fall_of_the_tsar',
  'fall_of_the_tsar_romania_bonus',
  'fall_of_the_tsar_russian_vp',
  'fourteen_points',
  'france',
  'french_mutiny',
  'french_mutiny_vp',
  'french_mutiny_vp_turn',
  'germany',
  'grand_fleet',
  'great_retreat',
  'great_retreat_used',
  'greece',
  'guns_of_august',
  'haig',
  'high_seas_fleet',
  'hl_take_command',
  'hoffman',
  'hottman',
  'independent_air_force',
  'influence',
  'influenza',
  'italian_nonentry',
  'italy',
  'kemal_turn',
  'kerensky_offensive',
  'kuwait',
  'landships',
  'libyan_revolt',
  'lloyd_george',
  'lusitania',
  'mef',
  'mef_beachhead',
  'michael',
  'mine_attack',
  'moltke',
  'montenegro',
  'neutral_entry',
  'oberost',
  'over_there',
  'peace_offensive',
  'peace_offensive_vp',
  'peace_terms_vp',
  'persia',
  'polish_restoration',
  'push',
  'race_to_the_sea',
  'rape_of_belgium',
  'reichstag_truce',
  'romania',
  'russia',
  'salonika',
  'serbia',
  'sinai_pipeline',
  'stavka_timidity',
  'sudarmy',
  'they_shall_not_pass',
  'treaty_of_brest_litovsk',
  'tsar_takes_command',
  'turkey',
  'uboats_unleashed',
  'usa',
  'von_below',
  'von_hutier',
  'walter_rathenau',
  'war_in_africa_vp',
  'wireless_intercepts',
  'withdrawal',
  'withdrawal_bonus_used',
  'yanks_and_tanks',
  'zeppelin_raids',
  'zimmerman_telegram'
];

// Reuse Paths of Glory menus and combat panels in an isolated, local DOM.
// No Chromium, remote assets, page scripts or browser networking are used.
class PathsRunner {
  constructor(mod) {
    this.mod = mod;
    this.menu = [];
    this.cards = [];
    this.revision = 0;
    this.rejected = new Set();
    this.visits = new Map();
    const html = require('../../../mods/paths/lib/core/game-html.template').default;
    this.dom = new JSDOM(
      html(mod.app, mod) + '<div id="runner-menu"></div><div id="game-hud2"></div>',
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
    global.alert = global.salert;
    // These legacy synchronous prompts occur before the rule mutation. Pause
    // at the prompt, then re-enter the same callback with the explicit answer.
    global.confirm = (message) => {
      if (this.confirmAnswer !== undefined) return this.confirmAnswer;
      throw new ConfirmationRequired(this.plain(message));
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
    mod.hud.showBackButton = (callback) => {
      this.backCallback = callback;
    };
    mod.hud.hideBackButton = () => {
      this.backCallback = null;
    };
    if (mod.restoreSnapshot) {
      const restoreSnapshot = mod.restoreSnapshot.bind(mod);
      mod.restoreSnapshot = (...args) => {
        const checkpoint = mod.game.runnerPaths;
        const restored = restoreSnapshot(...args);
        // Undo replaces the game object. Retain the whole decision journal,
        // including the undo, so replay reconstructs the same callback state.
        if (restored && checkpoint) mod.game.runnerPaths = checkpoint;
        return restored;
      };
    }
    // Keep rule-bearing overlays (loss assignment and replacements) intact.
    // Only their SaitoOverlay presentation is replaced with local containers.
    this.installOverlay(mod.overlay, 'main');
    for (const [name, component] of Object.entries(mod)) {
      if (name.endsWith('_overlay') && component?.overlay)
        this.installOverlay(component.overlay, name);
    }
    for (const name of ['zoom_overlay', 'minimap']) {
      const component = mod[name];
      for (const method of Object.getOwnPropertyNames(Object.getPrototypeOf(component)))
        if (method !== 'constructor' && typeof component[method] === 'function')
          component[method] = () => {};
    }
    for (const name of [
      'displayBoard',
      'displaySpace',
      'displayGeneralRecordsTrack',
      'displayActionRoundTracks',
      'displayMandatedOffensiveTracks',
      'displayTurnTrack',
      'displayUSCommitmentTrack',
      'displayRussianCapitulationTrack',
      'pulseSpacekey',
      'shakeSpacekey',
      'shakeUnit'
    ])
      mod[name] = () => {};
    const handle = mod.handleGameLoop.bind(mod);
    mod.handleGameLoop = async (...args) => {
      const { runnerPaths, runnerPathsWait, ...game } = mod.game;
      this.candidate = JSON.parse(JSON.stringify({ game, moves: mod.moves }));
      delete mod.game.runnerPaths;
      delete mod.game.runnerPathsWait;
      let result;
      try {
        result = await handle(...args);
      } catch (error) {
        // Keep a replayable boundary when a rule callback fails mid-command.
        // Do not leave a checkpoint from an earlier network step on disk.
        mod.game.runnerPaths = { base: this.candidate, actions: [] };
        mod.saveGame(mod.game.id);
        throw error;
      }
      // A paused command may already have changed units, tracks or cards, even
      // when the opponent owns the next choice. Rebuild from BEFORE that card.
      if (result === 0 && !mod.game.over) {
        if (this.sending) mod.game.runnerPathsWait = true;
        else mod.game.runnerPaths = { base: this.candidate, actions: [] };
      }
      return result;
    };
    const send = mod.sendGameMoveTransaction.bind(mod);
    mod.sendGameMoveTransaction = (...args) => {
      this.cardCallback = null;
      this.menuCallback = null;
      this.backCallback = null;
      for (const el of this.elements()) {
        el.onclick = null;
        this.$(el).off('click mouseup');
      }
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
    return createHash('sha256')
      .update(
        JSON.stringify([
          g.step,
          g.queue,
          g.state,
          g.spaces,
          g.deck?.[g.player - 1]?.hand,
          m.moves,
          this.status,
          this.menu,
          this.cards,
          this.dom.window.document.body.innerHTML
        ])
      )
      .digest('hex');
  }
  current() {
    const m = this.mod,
      g = m.game;
    if (this.failure) throw this.failure;
    if (
      !g?.state ||
      g.over ||
      g.terminating ||
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
      score -= 25 * (this.visits?.get(this.visitKey(key, action)) || 0);
      if (!this.rejected.has(JSON.stringify(action)))
        actions.push({ action, label: this.plain(label || value), score });
    };
    if (this.confirm) {
      add('confirm', false, 'No', 1);
      add('confirm', true, 'Yes');
    } else {
      if (this.backCallback) add('back', '', 'Back', -100);
      if (this.menuCallback)
        for (const item of this.menu)
          add('menu', item.id, item.label, this.menuScore(item.id, item.label));
      if (this.cardCallback)
        for (const card of this.cards)
          add('card', card, m.deck[card]?.name || card, this.cardScore(card));
      for (const el of this.elements()) {
        // HUD menu callbacks are represented above. Overlay IDs are often
        // duplicated (attacker/defender unit 0); use an unambiguous DOM path.
        if (!this.handlers(el).length || !this.visible(el)) continue;
        if (el.classList.contains('loss-overlay-unit')) {
          const unit = m.loss_overlay.units?.[Number(el.id)];
          if (!/^\d+$/.test(el.id) || !unit || unit.destroyed || unit.unassignable) continue;
        }
        add('element', this.elementPath(el), this.elementLabel(el), this.elementScore(el));
      }
    }
    if (!actions.length) {
      if (this.rejected.size) throw Error('Paths of Glory has no usable targets: ' + this.status);
      return null;
    }
    const observation = this.observation();
    return decision(g.id, this.revision, observation, actions);
  }
  visible(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (node.hidden || node.style.display === 'none') return false;
      if (node.classList.contains('submenu') && !node.classList.contains('is-open')) return false;
    }
    return true;
  }
  installOverlay(overlay, name) {
    const root = this.dom.window.document.createElement('div');
    root.className = 'saito-overlay';
    root.dataset.runnerOverlay = name;
    root.hidden = true;
    this.dom.window.document.body.append(root);
    overlay.show = (html, callback) => {
      if (html !== undefined) root.innerHTML = html;
      root.hidden = false;
      overlay.callback_on_close = callback;
    };
    overlay.hide = () => {
      root.hidden = true;
    };
    overlay.remove = () => {
      root.hidden = true;
      root.replaceChildren();
    };
    overlay.close = () => {
      overlay.hide();
      overlay.callback_on_close?.();
    };
    overlay.zIndex = 100;
    for (const key of ['pullOverlayToFront', 'blockClose', 'unblockClose']) overlay[key] = () => {};
  }
  elements() {
    // "Close to continue" in the resolved loss panel only dismisses artwork.
    // It is deliberately not a decision: that panel may predate the checkpoint.
    return this.dom.window.document.querySelectorAll(
      '.saito-overlay .option, .saito-overlay .loss-overlay-unit'
    );
  }
  elementPath(el) {
    const parts = [];
    while (el && el !== this.dom.window.document.body) {
      if (el.dataset.runnerOverlay) {
        return `[data-runner-overlay="${el.dataset.runnerOverlay}"] > ` + parts.join(' > ');
      }
      parts.unshift(
        `${el.tagName.toLowerCase()}:nth-child(${[...el.parentElement.children].indexOf(el) + 1})`
      );
      el = el.parentElement;
    }
    return 'body > ' + parts.join(' > ');
  }
  target(kind, value) {
    const el = this.dom.window.document.querySelector(value);
    return el && this.visible(el) && this.handlers(el).length ? el : undefined;
  }
  elementLabel(el) {
    if (el.classList.contains('loss-overlay-unit')) {
      const unit = this.mod.loss_overlay.units?.[Number(el.id)];
      return `Assign loss: ${unit?.name || el.dataset.key} at ${el.dataset.spacekey}`;
    }
    return el.textContent || el.id;
  }
  elementScore(el) {
    if (el.classList.contains('rp-unit-row')) return 100;
    if (el.classList.contains('is-selected')) return -80;
    if (el.classList.contains('loss-overlay-unit')) {
      const unit = this.mod.loss_overlay.units?.[Number(el.id)];
      return unit?.unassignable ? -100 : 30 - Number(unit?.combat || 0);
    }
    return this.menuScore(el.id);
  }
  observation() {
    const m = this.mod,
      g = m.game,
      s = g.state;
    const pick = (obj, fields) =>
      Object.fromEntries(fields.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
    // Explicit fields only. Never expose the two encrypted decks, dice seed,
    // opponent hand, journal base, signed outbox or wallet to a provider.
    return {
      game: 'Paths of Glory',
      rules: {
        campaign:
          '20 turns, six action rounds per side per turn; combined war status 40 ends the campaign.',
        victory:
          'Central Powers seek higher VP; Allies lower VP. Automatic victory: CP at 20, Allies at 0. At campaign end Allies win at 9 or less; CP win at 13 or more (11 with Treaty of Brest-Litovsk); otherwise draw.',
        play: 'Use cards for events, operations, strategic redeployment or replacement points. Preserve supply, fulfill mandated offensives, and consider terrain, trenches and replacement corps before attacking.'
      },
      seat: g.player,
      faction: m.returnFactionOfPlayer(),
      phase: this.confirm?.message || this.status,
      turn: s.turn,
      actionRound: s.round,
      step: g.step?.game,
      tracks: pick(s.general_records_track, [
        'vp',
        'central_war_status',
        'allies_war_status',
        'combined_war_status',
        'current_cp_russian_vp'
      ]),
      mandatedOffensives: s.mandated_offensives,
      replacements: s.rp,
      usCommitment: s.us_commitment_track,
      russianCapitulation: s.russian_capitulation_track,
      events: pick(s.events, PUBLIC_EVENTS),
      combat: pick(s.combat, [
        'key',
        'attacker_power',
        'defender_power',
        'attacking_faction',
        'attacker_strength',
        'defender_strength',
        'attacker_loss_factor',
        'defender_loss_factor',
        'attacker_drm',
        'defender_drm',
        'flank_attack',
        'winner'
      ]),
      activeCard: s.active_card,
      actions: { central: s.central_rounds, allies: s.allies_rounds },
      spaces: Object.fromEntries(
        Object.entries(g.spaces).map(([id, space]) => [
          id,
          {
            ...pick(space, [
              'name',
              'country',
              'control',
              'terrain',
              'vp',
              'fort',
              'besieged',
              'port',
              'trench',
              'oos',
              'neighbours',
              'activated_for_movement',
              'activated_for_combat'
            ]),
            units: space.units.map((unit) =>
              pick(unit, [
                'key',
                'name',
                'ckey',
                'army',
                'corps',
                'combat',
                'loss',
                'movement',
                'rcombat',
                'rloss',
                'rmovement',
                'damaged',
                'destroyed',
                'moved',
                'attacked'
              ])
            )
          }
        ])
      ),
      hand: (g.deck?.[g.player - 1]?.hand || []).map((id) => ({
        id,
        ...pick(m.deck[id], ['name', 'ops', 'sr', 'rp', 'ws', 'cc', 'text', 'key'])
      })),
      notice: this.notice || ''
    };
  }
  handlers(el) {
    return [
      ...(this.$._data(el, 'events')?.click || this.$._data(el, 'events')?.mouseup || []).map(
        (x) => x.handler
      ),
      ...(typeof el.onclick === 'function' ? [el.onclick] : [])
    ];
  }
  menuScore(id, label = '') {
    // Smoke-test policy. The model receives all available choices and board
    // information; these scores are used only by the heuristic provider.
    if (/\*\*\*/.test(label)) return -80; // Already selected; avoid toggling forever.
    if (label === 'attack with all') return 50;
    if (label === 'start attack') return -5;
    if (id === 'combat' && this.mod.returnPowerOfUnit) {
      const m = this.mod,
        faction = m.returnFactionOfPlayer();
      const front = Object.values(m.game.spaces).some(
        (s) =>
          !s.oos &&
          !s.activated_for_combat &&
          !s.activated_for_movement &&
          s.units.some((u) => m.returnPowerOfUnit(u) === faction) &&
          s.neighbours?.some((key) => {
            const n = m.game.spaces[key];
            return (
              n &&
              n.control !== faction &&
              n.control !== 'neutral' &&
              (n.units.length || n.fort > 0)
            );
          })
      );
      if (!front) return -40;
    }
    if (this.mod.game.spaces?.[id]) {
      const s = this.mod.game.spaces[id],
        faction = this.mod.returnFactionOfPlayer();
      return 10 + (s.vp ? 10 : 0) + (s.control !== faction ? 5 : 0);
    }
    return (
      {
        event: 30,
        ops: 20,
        combat: 20,
        movement: 10,
        rp: 5,
        sr: 0,
        repair_board: 30,
        repair_reserves: 20,
        uneliminate: 10,
        finish: -20,
        end: -20,
        cancel: -100,
        skip: -30,
        standdown: -30,
        entrench: -10,
        decline: 5,
        reject: 5,
        accept: -50
      }[id] || 0
    );
  }
  cardScore(id) {
    const c = this.mod.deck[id];
    if (!c) return id === 'pass' ? -100 : 0;
    return (
      (id === 'cp01' && this.mod.game.state.turn === 1 ? 100 : 0) +
      Number(c.ws || 0) * 5 +
      Number(c.ops || 0)
    );
  }
  async submit(id, choiceId) {
    const choice = selected(this.current(), id, choiceId);
    const g = this.mod.game;
    if (!g.runnerPaths && this.candidate) g.runnerPaths = { base: this.candidate, actions: [] };
    this.mod.saveGame(g.id);
    await this.execute(choice.action);
    if (this.mod.game.runnerPaths) this.mod.game.runnerPaths.actions.push(choice.action);
    this.mod.saveGame(this.mod.game.id);
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
      checkpoint = saved.runnerPaths;
    if (saved.runnerPathsWait && !saved.runnerDraft) {
      m.initializeGame(m.game.id);
      m.initialize_game_run = m.game.initialize_game_run = 1;
      m.gaming_active = 0;
      return;
    }
    if (saved.runnerDraft) {
      await this.sendDraft();
      return;
    }
    if (JSON.stringify(saved.step) !== JSON.stringify(checkpoint.base.game.step)) {
      throw Error('Paths checkpoint crossed a network step; refusing unsafe replay');
    }
    m.game = JSON.parse(JSON.stringify(checkpoint.base.game));
    m.moves = [...checkpoint.base.moves];
    m.initializeGame(m.game.id);
    m.initialize_game_run = m.game.initialize_game_run = 1;
    await m.handleGameLoop();
    for (const action of checkpoint.actions) await this.execute(action);
    m.game.runnerPaths = checkpoint;
    m.game.future = saved.future;
    m.gaming_active = 0;
    m.saveGame(m.game.id);
  }
  async execute(action) {
    const before = this.stateKey();
    const visit = this.visitKey(before, action);
    this.visits ||= new Map();
    this.visits.set(visit, (this.visits.get(visit) || 0) + 1);
    if (this.visits.size > 512) this.visits.delete(this.visits.keys().next().value);
    this.notice = '';
    const { kind, value } = action;
    let result;
    if (kind === 'confirm') {
      const c = this.confirm;
      this.confirm = null;
      if (c.action) {
        this.confirmAnswer = value;
        try {
          await this.execute(c.action);
        } finally {
          delete this.confirmAnswer;
        }
      } else {
        c.resolve(value);
        result = this.task;
      }
    } else
      try {
        if (kind === 'back') result = this.backCallback();
        else if (kind === 'menu') result = this.menuCallback(value);
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
      } catch (error) {
        if (!(error instanceof ConfirmationRequired)) throw error;
        this.confirm = { message: error.message, action };
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
  visitKey(state, action) {
    return createHash('sha256').update(state).update(JSON.stringify(action)).digest('hex');
  }
}
module.exports = PathsRunner;
