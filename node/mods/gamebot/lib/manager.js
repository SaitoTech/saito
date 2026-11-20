const Actions = require('./actions');
const { returnContext } = require('./context');

class Manager {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.actions = new Actions(this);
    this.active_game_mod = null;
    this.games = {};
    this.view = null;
    this.manual = null;
    this.on_context = null;
    this.listening = false;
    this.phase = 'splash';
    this.notice = '';
    this.issued_at = 0;
  }

  // Strictly increasing even when two events share a millisecond.
  returnTimestamp() {
    const now = new Date().getTime();
    if (now > this.issued_at) {
      this.issued_at = now;
    } else {
      this.issued_at += 1;
    }
    return this.issued_at;
  }

  returnGame(game_id) {
    let game = this.games[game_id];
    if (!game) {
      const now = new Date().getTime();
      game = {
        game_id,
        hash: '',
        moves: [],
        created_at: now,
        updated_at: now,
        last_queue_stable: 0
      };
      this.games[game_id] = game;
    }
    if (!Array.isArray(game.moves)) {
      game.moves = [];
    }
    if (game.last_queue_stable == null) {
      game.last_queue_stable = 0;
    }
    return game;
  }

  listen() {
    if (this.listening || !this.app.connection?.on) {
      return;
    }
    this.listening = true;
    this.app.connection.on('game-queue-stable', (payload) => {
      this.onGameQueueStable(payload);
    });
    this.app.connection.on('arcade-game-ready-render-request', (payload) => {
      if (this.phase !== 'loading' && this.phase !== 'game') {
        return;
      }
      this.dismissStartOverlay();
      const game_mod = (this.app.modules?.mods || []).find((mod) => mod?.game?.id === payload?.id);
      if (
        game_mod &&
        game_mod.halted == 1 &&
        typeof game_mod.gameBrowserActive === 'function' &&
        game_mod.gameBrowserActive() &&
        typeof game_mod.restartQueue === 'function'
      ) {
        game_mod.restartQueue();
      }
    });
  }

  gameModule(name) {
    if (!name) {
      return null;
    }
    return (
      this.app.modules?.returnModule?.(name) ||
      this.app.modules?.returnModuleBySlug?.(String(name).toLowerCase()) ||
      null
    );
  }

  async acceptGame(invite_link) {
    const arcade = this.app.modules?.returnModule?.('Arcade');
    if (!arcade?.returnGameInvite || !arcade?.sendJoinTransaction) {
      throw new Error('Arcade is not available');
    }

    const raw = String(invite_link || '').trim();
    if (!raw) {
      throw new Error('Enter an invite link');
    }
    let url;
    try {
      url = new URL(raw);
    } catch (err) {
      throw new Error('That is not an Arcade invite link');
    }
    let game_id = url.searchParams.get('game_id') || '';
    let game_name = url.searchParams.get('game') || '';
    if (!game_id && /\/arcade\/s\/[^/?#]+/.test(url.pathname)) {
      const resolved = await this.followArcadeShortLink(raw);
      game_id = resolved.game_id;
      game_name = resolved.game_name;
    }
    if (!game_id) {
      throw new Error('That invitation could not be found');
    }

    const found = await arcade.returnGameInvite(game_id, game_name);
    if (!found?.game_tx || found.from_archive) {
      throw new Error('No open invitation found for that link');
    }
    const message = found.game_tx.returnMessage?.() || found.game_tx.msg || {};
    if (!message.game) {
      throw new Error('The invitation has no game module');
    }
    if (this.gameModule(message.game) == null && this.gameModule(game_name) == null) {
      throw new Error(message.game + ' is not installed');
    }

    const open_table = message.request === 'active' && message.options?.['open-table'];
    const table_mod = open_table ? this.gameModule(message.game) : null;
    if (open_table && typeof table_mod?.requestSeatAtTable !== 'function') {
      throw new Error('This open table cannot be joined');
    }
    if (!open_table && typeof arcade.isAvailableGame === 'function' && !arcade.isAvailableGame(found.game_tx)) {
      throw new Error('That invitation is not open');
    }
    if (!open_table && message.options && typeof message.options === 'object') {
      message.options.desired_opponent_publickey = this.mod.publicKey;
    }
    if (!open_table) {
      arcade.addInviteRecord?.(found.game_tx);
    }

    const accepted_id = found.game_tx.signature || game_id;
    const game_mod = this.gameModule(message.game) || this.gameModule(game_name);
    const already = this.gameInitialized(accepted_id);
    await this.presentGame(game_mod, accepted_id, already ? 'open' : 'accept');
    if (already) {
      this.mod.game_screen?.remove_loading_veil();
      return accepted_id;
    }

    let settled = false;
    let resolveReady = () => {};
    const ready = new Promise((resolve) => {
      resolveReady = resolve;
    });
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      this.app.connection?.off?.('arcade-game-ready-render-request', on_ready);
      this.app.connection?.off?.('game-queue-stable', on_stable);
      resolveReady();
    };
    const on_ready = (payload) => {
      if (payload?.id !== accepted_id) {
        return;
      }
      finish();
    };
    const on_stable = (payload) => {
      if (payload?.game_id !== accepted_id) {
        return;
      }
      finish();
    };
    if (this.app.connection?.on) {
      this.app.connection.on('arcade-game-ready-render-request', on_ready);
      this.app.connection.on('game-queue-stable', on_stable);
    }

    try {
      if (open_table) {
        await table_mod.requestSeatAtTable(found.game_tx);
      } else {
        await arcade.sendJoinTransaction({ tx: found.game_tx });
      }
    } catch (err) {
      this.app.connection?.off?.('arcade-game-ready-render-request', on_ready);
      this.app.connection?.off?.('game-queue-stable', on_stable);
      this.mod.game_screen?.remove_loading_veil();
      throw err;
    }

    if (!settled && this.gameInitialized(accepted_id)) {
      finish();
    }
    if (!settled) {
      if (!this.app.connection?.on) {
        this.mod.game_screen?.remove_loading_veil();
        throw new Error('The game was not initialized');
      }
      let timer;
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => {
          this.app.connection.off('arcade-game-ready-render-request', on_ready);
          this.app.connection.off('game-queue-stable', on_stable);
          reject(new Error('The game was not initialized'));
        }, 30000);
      });
      try {
        await Promise.race([ready, expired]);
      } finally {
        clearTimeout(timer);
      }
    }
    if (!game_mod?.board && Number(game_mod?.game?.initializing) === 0 && typeof game_mod?.initializeGame === 'function') {
      await game_mod.initializeGame(accepted_id);
    }
    await this.mod.game_screen?.refresh_chrome(game_mod);
    this.dismissStartOverlay();
    this.mod.game_screen?.remove_loading_veil();
    return accepted_id;
  }

  // Browser presentation is the Game screen. Examination does not come through here.
  async presentGame(game_mod, game_id, mode) {
    if (!game_mod || !this.app.BROWSER) {
      return;
    }
    await this.mod.game_screen?.present(game_mod, game_id, mode);
  }

  dismissStartOverlay() {
    const arcade = this.app.modules?.returnModule?.('Arcade');
    if (arcade && typeof arcade._closeReadyPopup === 'function') {
      arcade._closeReadyPopup();
    }
  }

  // Arcade stores the long invite and serves /arcade/s/{code} as a redirect to it.
  async followArcadeShortLink(raw) {
    let response;
    try {
      response = await fetch(raw);
    } catch (err) {
      throw new Error('That invitation could not be found');
    }
    if (response.status === 404) {
      let body = '';
      try {
        body = await response.text();
      } catch (err) {
        body = '';
      }
      if (/expired/i.test(body)) {
        throw new Error('That invitation link has expired');
      }
      throw new Error('That invitation could not be found');
    }
    let final_url;
    try {
      final_url = new URL(response.url || '');
    } catch (err) {
      throw new Error('That invitation could not be found');
    }
    return {
      game_id: final_url.searchParams.get('game_id') || '',
      game_name: final_url.searchParams.get('game') || ''
    };
  }

  async openGame(game_id) {
    const id = String(game_id || '').trim();
    const stored = (this.app.options?.games || []).find((game) => game.id === id);
    if (!stored) {
      throw new Error('No local game has that id');
    }
    const game_mod = this.gameModule(stored.module);
    if (game_mod) {
      await this.presentGame(game_mod, id, 'open');
      this.mod.game_screen?.remove_loading_veil();
    }
    return id;
  }

  // Load the game for this queue-stable timestamp, then examine it unless a
  // newer queue-stable event arrived while loading.
  async onGameQueueStable(data) {
    const timestamp = this.returnTimestamp();
    try {
      await this.loadGame(data?.game_id, timestamp);
      if ((this.games[data?.game_id]?.last_queue_stable ?? 0) !== timestamp) {
        return;
      }
      await this.examineGameState(data?.game_id, timestamp);
    } catch (err) {
      console.error('GameBot could not examine ' + data?.game_id, err);
      throw err;
    }
  }

  // The game was loaded by loadGame. timestamp identifies the queue-stable
  // event this examination belongs to. Context comes first, then the first
  // automatic interaction list, or the AI.
  async examineGameState(game_id, timestamp) {
    if (!game_id) {
      return null;
    }
    if (timestamp == null) {
      timestamp = this.games[game_id]?.last_queue_stable ?? 0;
    }
    if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
      return this.view;
    }
    const game_mod = this.active_game_mod?.game?.id === game_id ? this.active_game_mod : null;
    let context = null;
    let context_error = '';
    let halted = false;
    if (!game_mod) {
      context_error = 'That game is not on this node';
    } else {
      try {
        const returned = game_mod.returnContext?.() ?? null;
        context = returned
          ? JSON.parse(
              JSON.stringify(returned, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
            )
          : null;
        const hooks = this.gameHooks(game_mod);
        if (typeof hooks?.returnContext === 'function') {
          const specific = hooks.returnContext(context);
          if (specific !== undefined) {
            context = specific;
          }
        }
        context = this.mod.jsdom.returnContext(context);
        context = returnContext(game_mod, context);
        if (context && typeof context === 'object' && !Array.isArray(context)) {
          context.timestamp = timestamp;
        }
        halted = this.actions.handleEmptyMenu(context);
      } catch (err) {
        context = null;
        context_error = err?.message || 'returnContext() failed';
      }
    }
    const clickable_items = game_mod && !context_error ? this.mod.jsdom.returnOptions() : [];
    const stored = (this.app.options?.games || []).find((game) => game.id === game_id);
    this.view = {
      game_id,
      module_name: stored?.module || game_mod?.name || '',
      slug: game_mod?.returnSlug?.() || game_mod?.slug || '',
      context,
      context_error,
      clickable_items
    };
    this.on_context?.(game_id);

    if (!game_mod || context_error) {
      return this.view;
    }
    if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
      return this.view;
    }

    const overlay = await this.actions.handleInformationalOverlay(context);
    const automatic = overlay?.length ? overlay : await this.actions.handleSingleMenuOption(context);
    if (automatic?.length) {
      await this.executeMoves(game_id, automatic, timestamp, true);
      if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
        return this.view;
      }
      return this.examineGameState(game_id, timestamp);
    }
    if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
      return this.view;
    }
    if (halted) {
      return this.view;
    }
    await this.mod.ai.requestResponse(context);
    return this.view;
  }

  // The board watcher fills an empty menu from the live document.
  // A new examination replaces the stored context instead of using this.
  refreshEmptyMenu() {
    const view = this.view;
    if (!view?.context || typeof view.context !== 'object' || Array.isArray(view.context)) {
      return false;
    }
    if (!Array.isArray(view.context.menu) || view.context.menu.length > 0) {
      return false;
    }
    let menu = [];
    try {
      menu = this.mod.jsdom.gameActions();
    } catch (err) {
      return false;
    }
    if (!menu.length) {
      return false;
    }
    view.context.menu = menu;
    try {
      view.clickable_items = this.mod.jsdom.returnOptions();
    } catch (err) {
      view.clickable_items = view.clickable_items || [];
    }
    this.on_context?.(view.game_id);
    return true;
  }

  async handleManualInput(game_id, input) {
    const text = String(input ?? '');
    const instruction = text.trim();
    if (!instruction) {
      return this.recordManual(game_id, {
        input: text,
        processed: false,
        response: 'Type an instruction'
      });
    }

    let executed = null;
    try {
      executed = await this.handleResponse(game_id, instruction);
    } catch (err) {
      return this.recordManual(game_id, {
        input: instruction,
        processed: false,
        response: err.message || 'The instruction could not be processed'
      });
    }

    if (!executed) {
      return this.recordManual(game_id, {
        input: instruction,
        processed: false,
        response: 'The response was not executed'
      });
    }
    return this.recordManual(game_id, {
      input: instruction,
      processed: true,
      response: 'Executed ' + executed
    });
  }

  // A mismatched game id is rejected before the game is loaded. A
  // game-specific handler that returns exactly 1 has finished the response.
  // Otherwise the response is a generic sequence of DOM clicks. Examination
  // follows the whole response, not each click. An AI response carries the
  // timestamp of the state it describes. Manual input does not.
  async handleResponse(game_id, response) {
    if (response?.game_id && response.game_id !== game_id) {
      return null;
    }
    let timestamp = response?.timestamp;
    const game = await this.loadGame(game_id);
    if (timestamp == null) {
      timestamp = this.games[game_id]?.last_queue_stable ?? 0;
    } else if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
      return null;
    }

    const hooks = this.gameHooks(this.active_game_mod);
    if (typeof hooks?.handleResponse === 'function' && (await hooks.handleResponse(response)) === 1) {
      if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
        return 1;
      }
      await this.examineGameState(game_id, timestamp);
      return 1;
    }

    const payload = this.responsePayload(response);
    if (payload == null) {
      return null;
    }
    const moves = this.responseMoves(payload);
    if (!game) {
      throw new Error('That game is not on this node');
    }
    const executed = await this.executeMoves(game_id, moves, timestamp, true);
    if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
      return executed;
    }
    await this.examineGameState(game_id, timestamp);
    return executed;
  }

  // One execution path for automatic actions, AI responses, and manual moves.
  // timestamp is the queue-stable event this sequence belongs to.
  // record is false when loadGame is replaying history it already stored.
  async executeMoves(game_id, moves, timestamp, record) {
    const executed = [];
    for (let i = 0; i < moves.length; i++) {
      if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
        return executed;
      }
      const identifier = typeof moves[i] === 'string' ? moves[i] : moves[i]?.move;
      this.mod.jsdom.returnOptions();
      let target;
      try {
        target = await this.mod.jsdom.executeClick(identifier);
      } catch (err) {
        const reason = err?.message || 'The move could not be executed';
        throw new Error('Move ' + (i + 1) + ' (' + identifier + ') failed: ' + reason);
      }
      if ((this.games[game_id]?.last_queue_stable ?? 0) !== timestamp) {
        return executed;
      }
      if (record) {
        const game = this.returnGame(game_id);
        game.moves.push({ move: target, timestamp: this.returnTimestamp() });
        game.updated_at = new Date().getTime();
      }
      executed.push(target);
    }
    return executed;
  }

  // The AI wrapper may return no choice. A response that was actually
  // supplied is validated by responseMoves, whether it came from the AI
  // or from the Context field.
  responsePayload(analysis) {
    if (analysis == null || analysis === '') {
      return null;
    }
    if (typeof analysis === 'string') {
      return analysis;
    }
    if (typeof analysis !== 'object' || Array.isArray(analysis)) {
      return analysis;
    }
    if ('moves' in analysis) {
      return analysis;
    }
    if ('identifier' in analysis) {
      if (analysis.identifier == null || String(analysis.identifier).trim() === '') {
        return null;
      }
      return String(analysis.identifier);
    }
    return analysis;
  }

  responseMoves(response) {
    const value = this.parseResponse(response);
    if (typeof value === 'string') {
      const identifier = value.trim();
      if (!identifier) {
        throw new Error('The response has no move');
      }
      return [identifier];
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.moves)) {
      throw new Error('The response is not a move or a moves object');
    }
    if (value.moves.length === 0) {
      throw new Error('The moves array is empty');
    }
    const moves = [];
    for (let i = 0; i < value.moves.length; i++) {
      const entry = value.moves[i];
      if (typeof entry !== 'string' || entry.trim() === '') {
        throw new Error('Move ' + (i + 1) + ' is not an action identifier');
      }
      moves.push(entry.trim());
    }
    return moves;
  }

  parseResponse(response) {
    if (typeof response !== 'string') {
      return response;
    }
    const text = response.trim();
    if (!text.startsWith('{') && !text.startsWith('[')) {
      return text;
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error('The response is not valid JSON');
    }
  }

  recordManual(game_id, reply) {
    this.manual = { game_id, ...reply };
    this.on_context?.(game_id);
    return this.manual;
  }

  // lib/games/<slug>.js may export returnContext(context) and handleResponse(response).
  gameHooks(game_mod) {
    const slug = String(game_mod?.returnSlug?.() || game_mod?.slug || game_mod?.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
    if (!slug) {
      return null;
    }
    try {
      return require('./games/' + slug);
    } catch (err) {
      if (err?.code === 'MODULE_NOT_FOUND') {
        return null;
      }
      throw err;
    }
  }

  // Locate the saved game and, when this module is not already holding it,
  // install the saved JSON. A queue-stable timestamp retires older recorded
  // moves before that work. Replay history newer than last_queue_stable only
  // for a restoration. Returns the game ready for the next move.
  async loadGame(game_id, timestamp) {
    if (!game_id) {
      return null;
    }
    if (timestamp != null) {
      const game = this.returnGame(game_id);
      game.last_queue_stable = timestamp;
      game.moves = game.moves.filter((item) => item && item.timestamp > timestamp);
    }
    const stored = (this.app.options?.games || []).find((game) => game.id === game_id);
    const game_mod = this.gameModule(stored?.module);
    if (!game_mod) {
      this.active_game_mod = null;
      return null;
    }
    this.active_game_mod = game_mod;

    const dom_ready =
      this.app.BROWSER || game_mod.uses_jsdom == 1 || typeof game_mod.loadGameWithJSDOM !== 'function';
    const resident = game_mod.game?.id === game_id && dom_ready;
    let reloaded = false;
    if (!resident) {
      if (!this.app.BROWSER && typeof game_mod.loadGameWithJSDOM === 'function') {
        await game_mod.loadGameWithJSDOM(game_id);
      } else if (typeof game_mod.loadGame === 'function') {
        await game_mod.loadGame(game_id);
      }
      reloaded = true;
      const source = game_mod.game?.id === game_id ? game_mod.game : stored;
      if (!source || source.id !== game_id) {
        return null;
      }
      game_mod.game = JSON.parse(
        JSON.stringify(source, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
      );
    }
    if (!game_mod.game) {
      return null;
    }

    const game = this.returnGame(game_id);
    const hash = this.app.crypto.hash(JSON.stringify(game_mod.game));
    if (!game.hash || reloaded) {
      game.hash = hash;
    }
    if (reloaded) {
      const pending = game.moves.filter((item) => item && item.timestamp > game.last_queue_stable);
      if (pending.length) {
        await this.executeMoves(
          game_id,
          pending.map((item) => item.move),
          game.last_queue_stable,
          false
        );
      }
    }
    return game_mod.game;
  }

  gameInitialized(game_id) {
    const game_mod = (this.app.modules?.mods || []).find((mod) => mod?.game?.id === game_id);
    return game_mod != null && Number(game_mod.game.initializing) === 0;
  }
}

module.exports = Manager;
