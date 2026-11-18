class Manager {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.active_game_mod = null;
    this.view = null;
    this.manual = null;
    this.on_context = null;
    this.listening = false;
    this.phase = 'splash';
    this.notice = '';
  }

  listen() {
    if (this.listening || !this.app.connection?.on) {
      return;
    }
    this.listening = true;
    this.app.connection.on('game-queue-stable', (payload) => {
      const game_id = payload?.game_id;
      if (!game_id) {
        return;
      }
      // One examination per game while that examination is still running.
      // A later stable event, after it finishes, examines the new boundary.
      if (!this.examinations) {
        this.examinations = {};
      }
      if (this.examinations[game_id]) {
        return;
      }
      this.examinations[game_id] = true;
      this.examine_game_move(game_id)
        .catch((err) => {
          console.error('GameBot could not examine ' + game_id, err);
        })
        .finally(() => {
          delete this.examinations[game_id];
        });
    });
    this.app.connection.on('arcade-game-ready-render-request', (payload) => {
      if (this.phase !== 'loading' && this.phase !== 'game') {
        return;
      }
      this.dismiss_start_overlay();
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

  game_module(name) {
    if (!name) {
      return null;
    }
    return (
      this.app.modules?.returnModule?.(name) ||
      this.app.modules?.returnModuleBySlug?.(String(name).toLowerCase()) ||
      null
    );
  }

  async accept_game(invite_link) {
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
      const resolved = await this.follow_arcade_short_link(raw);
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
    if (this.game_module(message.game) == null && this.game_module(game_name) == null) {
      throw new Error(message.game + ' is not installed');
    }

    const open_table = message.request === 'active' && message.options?.['open-table'];
    const table_mod = open_table ? this.game_module(message.game) : null;
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
    const game_mod = this.game_module(message.game) || this.game_module(game_name);
    const already = this.game_initialized(accepted_id);
    await this.present_game(game_mod, accepted_id, already ? 'open' : 'accept');
    if (already) {
      this.remove_loading_veil();
      return accepted_id;
    }

    let settled = false;
    let resolve_ready = () => {};
    const ready = new Promise((resolve) => {
      resolve_ready = resolve;
    });
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      this.app.connection?.off?.('arcade-game-ready-render-request', on_ready);
      this.app.connection?.off?.('game-queue-stable', on_stable);
      resolve_ready();
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
      this.remove_loading_veil();
      throw err;
    }

    if (!settled && this.game_initialized(accepted_id)) {
      finish();
    }
    if (!settled) {
      if (!this.app.connection?.on) {
        this.remove_loading_veil();
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
    await this.refresh_game_chrome(game_mod);
    this.dismiss_start_overlay();
    this.remove_loading_veil();
    return accepted_id;
  }

  // Make the game the active browser module and let its own render() inject the
  // board markup before initializeGame() or READY consult gameBrowserActive().
  async present_game(game_mod, game_id, mode) {
    if (!game_mod || !this.app.BROWSER) {
      return;
    }
    if (typeof game_mod.activateModule === 'function') {
      game_mod.activateModule();
    } else {
      game_mod.browser_active = 1;
    }
    this.set_game_hash(game_id);

    if (!game_mod.game || game_mod.game.id !== game_id) {
      let loaded = false;
      if (mode === 'open' && typeof game_mod.loadGame === 'function') {
        await game_mod.loadGame(game_id);
        loaded = true;
      }
      if (!loaded && mode === 'accept' && typeof game_mod.doesGameExistLocally === 'function') {
        loaded = await game_mod.doesGameExistLocally(game_id);
        if (loaded && typeof game_mod.loadGame === 'function') {
          await game_mod.loadGame(game_id);
        }
      }
      if (!loaded && (!game_mod.game || game_mod.game.id !== game_id) && typeof game_mod.newGame === 'function') {
        game_mod.game = game_mod.newGame(game_id);
      }
    }

    await this.load_game_scripts();
    await this.load_game_styles(game_mod);
    if (game_mod.initialize_game_run != 1 && typeof game_mod.render === 'function') {
      await game_mod.render(this.app);
    }
    this.show_loading_veil();

    // The saved game is already loaded and the board markup is in the document.
    // initializeGameQueue() is the normal startup: it calls initializeGame() and
    // then startQueue(). Setting initialize_game_run first would make that
    // function return before the queue runs. A second call in this activation
    // returns there itself, so the queue is not started twice.
    if (
      mode === 'open' &&
      Number(game_mod.game?.initializing) !== 1 &&
      typeof game_mod.initializeGameQueue === 'function'
    ) {
      await game_mod.initializeGameQueue(game_id);
    }
  }

  // The first render can run before the seat number is known. Once the queue
  // has assigned it, rebuild the game chrome without wiping the injected board.
  async refresh_game_chrome(game_mod) {
    if (!this.app.BROWSER || !game_mod?.game || typeof game_mod.render !== 'function') {
      return;
    }
    if (Number(game_mod.game.player) <= 0 || !game_mod.menu) {
      return;
    }
    if (game_mod.game_template_injected != 1) {
      return;
    }
    game_mod.menu.options = [];
    game_mod.menu.sub_options = [];
    game_mod.menu.icons = [];
    const previous = game_mod.initialize_game_run;
    game_mod.initialize_game_run = 0;
    try {
      await game_mod.render(this.app);
    } finally {
      game_mod.initialize_game_run = previous || 1;
    }
  }

  // Scripts from the game page head. jQuery must exist before a game's
  // initializeGame() runs; Twilight Struggle calls $ there.
  game_scripts() {
    return [
      '/saito/lib/jquery/jquery-3.2.1.min.js',
      '/saito/lib/jquery/jquery-ui.min.js',
      '/saito/lib/hammer/hammer.min.js'
    ];
  }

  async load_game_scripts() {
    if (!this.app.BROWSER || typeof document === 'undefined' || !document.head) {
      return [];
    }
    const view = document.defaultView;
    const loads = view && !/jsdom/i.test(view.navigator?.userAgent || '');
    const added = [];
    for (const src of this.game_scripts()) {
      const present = Array.from(document.scripts).some((script) => {
        return (script.getAttribute('src') || '').includes(src);
      });
      if (present) {
        continue;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      const ready = loads
        ? new Promise((resolve) => {
            script.onload = () => resolve();
            script.onerror = () => resolve();
          })
        : Promise.resolve();
      document.head.appendChild(script);
      await ready;
      added.push(src);
    }
    return added;
  }

  // The same head a game module page emits in gametemplate-src/index.js,
  // plus any sheets the module registers on this.styles.
  game_stylesheets(game_mod) {
    const slug = game_mod?.returnSlug?.() || game_mod?.slug || '';
    const sheets = [
      '/saito/lib/jquery/jquery-ui.min.css',
      '/saito/lib/font-awesome-6/css/fontawesome.min.css',
      '/saito/lib/font-awesome-6/css/all.css',
      '/arcade/style.css',
      '/saito/game.css'
    ];
    if (slug) {
      sheets.push('/' + slug + '/style.css');
    }
    const extra = Array.isArray(game_mod?.styles) ? game_mod.styles : [];
    for (const sheet of extra) {
      if (!sheet || String(sheet).includes('/gamebot/')) {
        continue;
      }
      if (!sheets.includes(sheet)) {
        sheets.push(sheet);
      }
    }
    return sheets;
  }

  async load_game_styles(game_mod) {
    if (!this.app.BROWSER || typeof document === 'undefined' || !document.head || !game_mod) {
      return [];
    }
    const slug = game_mod.returnSlug?.() || game_mod.slug || '';
    if (slug && document.documentElement) {
      document.documentElement.classList.add('game', slug);
    }
    const present = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((el) => el.getAttribute('href') || '');
    const added = [];
    const waits = [];
    for (const href of this.game_stylesheets(game_mod)) {
      if (present.some((current) => current.includes(href))) {
        continue;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href + '?v=' + (this.app.build_number || '');
      link.setAttribute('data-game-module', slug);
      const view = document.defaultView;
      const loads_styles = view && !/jsdom/i.test(view.navigator?.userAgent || '');
      waits.push(loads_styles
        ? new Promise((resolve) => {
            link.onload = () => resolve();
            link.onerror = () => resolve();
          })
        : Promise.resolve());
      document.head.appendChild(link);
      added.push(href);
      present.push(link.href);
    }
    await Promise.all(waits);
    return added;
  }

  set_game_hash(game_id) {
    if (typeof window === 'undefined' || !window.location || !game_id) {
      return;
    }
    const next = 'gid=' + encodeURIComponent(game_id);
    if (String(window.location.hash || '').replace(/^#/, '') === next) {
      return;
    }
    window.location.hash = next;
  }

  show_loading_veil() {
    if (typeof document === 'undefined' || !document.body || document.getElementById('gamebot-loading')) {
      return;
    }
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div id="gamebot-loading" class="gamebot-loading"><p>Loading</p></div>'
    );
  }

  remove_loading_veil() {
    if (typeof document === 'undefined') {
      return;
    }
    document.getElementById('gamebot-loading')?.remove();
  }

  dismiss_start_overlay() {
    const arcade = this.app.modules?.returnModule?.('Arcade');
    if (arcade && typeof arcade._closeReadyPopup === 'function') {
      arcade._closeReadyPopup();
    }
  }

  // Arcade stores the long invite and serves /arcade/s/{code} as a redirect to it.
  async follow_arcade_short_link(raw) {
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

  async open_game(game_id) {
    const id = String(game_id || '').trim();
    const stored = (this.app.options?.games || []).find((game) => game.id === id);
    if (!stored) {
      throw new Error('No local game has that id');
    }
    const game_mod = this.game_module(stored.module);
    if (game_mod) {
      await this.present_game(game_mod, id, 'open');
      this.remove_loading_veil();
    }
    return id;
  }

  async examine_game_move(game_id) {
    const game_mod = await this.prepare_game(game_id);
    if (!game_mod) {
      this.view = { game_id, context: null, clickable_items: [], context_error: 'That game is not on this node' };
      this.on_context?.(game_id);
      return this.view;
    }

    let context = null;
    let context_error = '';
    try {
      const returned = game_mod.returnContext?.() ?? null;
      context = returned
        ? JSON.parse(
            JSON.stringify(returned, (key, value) => (typeof value === 'bigint' ? value.toString() : value))
          )
        : null;
    } catch (err) {
      context_error = err?.message || 'returnContext() failed';
    }

    const clickable_items = this.mod.jsdom.get_clickable_items();
    if (context && typeof context === 'object' && (!Array.isArray(context.menu) || context.menu.length === 0)) {
      context.menu = this.mod.jsdom.game_actions();
    }
    context = this.finish_context(game_mod, context);
    const stored = (this.app.options?.games || []).find((game) => game.id === game_id);
    this.view = {
      game_id,
      module_name: stored?.module || game_mod.name || '',
      slug: game_mod.returnSlug?.() || game_mod.slug || '',
      context,
      context_error,
      clickable_items
    };
    this.on_context?.(game_id);

    if (!context_error) {
      const analysis = await this.mod.ai.submit_analysis({
        game_id,
        context,
        clickable_items
      });
      await this.receive_ai_analysis(game_id, analysis);
    }
    return this.view;
  }

  async receive_manual_input(game_id, input) {
    const text = String(input ?? '');
    const instruction = text.trim();
    if (!instruction) {
      return this.record_manual(game_id, {
        input: text,
        processed: false,
        response: 'Type an instruction'
      });
    }

    const game_mod = await this.prepare_game(game_id);
    if (!game_mod) {
      return this.record_manual(game_id, {
        input: instruction,
        processed: false,
        response: 'That game is not on this node'
      });
    }

    let context = null;
    try {
      context = game_mod.returnContext?.() ?? null;
    } catch (err) {
      context = null;
    }
    const analysis = await this.mod.ai.submit_analysis({
      game_id,
      instruction,
      context,
      clickable_items: this.mod.jsdom.get_clickable_items()
    });

    let executed = null;
    try {
      executed = await this.receive_ai_analysis(game_id, analysis);
    } catch (err) {
      return this.record_manual(game_id, {
        input: instruction,
        processed: false,
        response: err.message || 'The instruction could not be processed'
      });
    }

    if (!executed) {
      return this.record_manual(game_id, {
        input: instruction,
        processed: false,
        response: 'No AI is configured to interpret this instruction'
      });
    }
    return this.record_manual(game_id, {
      input: instruction,
      processed: true,
      response: 'Executed ' + executed
    });
  }

  async execute_clickable_item(game_id, identifier) {
    const game_mod = await this.prepare_game(game_id);
    if (!game_mod) {
      throw new Error('That game is not on this node');
    }
    await this.mod.jsdom.execute_click(identifier);
    return this.examine_game_move(game_id);
  }

  async receive_ai_analysis(game_id, analysis) {
    const identifier = String(analysis?.identifier || '').trim();
    if (!identifier || (analysis?.game_id && analysis.game_id !== game_id)) {
      return null;
    }
    const game_mod = await this.prepare_game(game_id);
    if (!game_mod) {
      return null;
    }
    const items = this.mod.jsdom.get_clickable_items();
    if (!items.some((item) => item.identifier === identifier)) {
      return null;
    }
    await this.mod.jsdom.execute_click(identifier);
    return identifier;
  }

  record_manual(game_id, reply) {
    this.manual = { game_id, ...reply };
    this.on_context?.(game_id);
    return this.manual;
  }

  finish_context(game_mod, context) {
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return context;
    }
    if (context.game && typeof context.game === 'object' && !Array.isArray(context.game)) {
      this.prune_game_copy(context.game);
    }
    const game = context.game;
    const menu = context.menu;
    const rest = { ...context };
    delete rest.instructions;
    delete rest.game;
    delete rest.menu;
    const finished = {
      instructions: this.context_instructions(game_mod),
      ...rest
    };
    if (game !== undefined) {
      finished.game = game;
    }
    if (menu !== undefined) {
      finished.menu = menu;
    }
    return finished;
  }

  context_instructions(game_mod) {
    let title = 'this game';
    if (typeof game_mod?.returnTitle === 'function' && game_mod.returnTitle()) {
      title = game_mod.returnTitle();
    } else if (typeof game_mod?.returnName === 'function' && game_mod.returnName()) {
      title = game_mod.returnName();
    } else if (game_mod?.gamename || game_mod?.name) {
      title = game_mod.gamename || game_mod.name;
    }
    return 'You are playing ' + title + '. If it is your turn, select a menu option and return the identifier of the option chosen.';
  }

  // The snapshot is already a copy. Empty arrays are removed at every level.
  // Null, blank, and zero values are removed only from the top of the game.
  prune_game_copy(game) {
    this.remove_empty_arrays(game);
    for (const key of Object.keys(game)) {
      if (game[key] === null || game[key] === '' || game[key] === 0) {
        delete game[key];
      }
    }
  }

  remove_empty_arrays(value) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        value[i] = this.remove_empty_arrays(value[i]);
      }
      return value.filter((entry) => !(Array.isArray(entry) && entry.length === 0));
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    for (const key of Object.keys(value)) {
      const child = this.remove_empty_arrays(value[key]);
      if (Array.isArray(child) && child.length === 0) {
        delete value[key];
      } else {
        value[key] = child;
      }
    }
    return value;
  }

  async prepare_game(game_id) {
    const stored = (this.app.options?.games || []).find((game) => game.id === game_id);
    const game_mod = this.game_module(stored?.module);
    if (!game_mod) {
      this.active_game_mod = null;
      return null;
    }
    this.active_game_mod = game_mod;

    if (!this.app.BROWSER && typeof game_mod.loadGameWithJSDOM === 'function') {
      if (game_mod.uses_jsdom != 1 || game_mod.game?.id !== game_id) {
        await game_mod.loadGameWithJSDOM(game_id);
      }
    } else if (game_mod.game?.id !== game_id && typeof game_mod.loadGame === 'function') {
      await game_mod.loadGame(game_id);
    }
    return game_mod;
  }

  game_initialized(game_id) {
    const game_mod = (this.app.modules?.mods || []).find((mod) => mod?.game?.id === game_id);
    return game_mod != null && Number(game_mod.game.initializing) === 0;
  }
}

module.exports = Manager;
