class Manager {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.active_game_mod = null;
    this.view = null;
    this.manual = null;
    this.on_context = null;
    this.listening = false;
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
      this.examine_game_move(game_id).catch((err) => {
        console.error('GameBot could not examine ' + game_id, err);
      });
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
    let game_id = '';
    let game_name = '';
    try {
      const url = new URL(raw);
      game_id = url.searchParams.get('game_id') || '';
      game_name = url.searchParams.get('game') || '';
    } catch (err) {
      const id_match = raw.match(/game_id=([^&\s]+)/);
      const game_match = raw.match(/(?:^|[?&])game=([^&\s]+)/);
      if (id_match) {
        try {
          game_id = decodeURIComponent(id_match[1]);
        } catch (decode_err) {
          game_id = id_match[1];
        }
        if (game_match) {
          try {
            game_name = decodeURIComponent(game_match[1]);
          } catch (decode_err) {
            game_name = game_match[1];
          }
        }
      }
    }
    if (!game_id) {
      throw new Error('Paste an Arcade invite link');
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
    if (this.game_initialized(accepted_id)) {
      return accepted_id;
    }

    let settled = false;
    let resolve_ready = () => {};
    const ready = new Promise((resolve) => {
      resolve_ready = resolve;
    });
    const on_ready = (payload) => {
      if (payload?.id !== accepted_id) {
        return;
      }
      settled = true;
      this.app.connection.off('arcade-game-ready-render-request', on_ready);
      resolve_ready();
    };
    if (this.app.connection?.on) {
      this.app.connection.on('arcade-game-ready-render-request', on_ready);
    }

    try {
      if (open_table) {
        await table_mod.requestSeatAtTable(found.game_tx);
      } else {
        await arcade.sendJoinTransaction({ tx: found.game_tx });
      }
    } catch (err) {
      this.app.connection?.off?.('arcade-game-ready-render-request', on_ready);
      throw err;
    }

    if (!settled && this.game_initialized(accepted_id)) {
      this.app.connection?.off?.('arcade-game-ready-render-request', on_ready);
      settled = true;
    }
    if (!settled) {
      if (!this.app.connection?.on) {
        throw new Error('The game was not initialized');
      }
      await ready;
    }
    return accepted_id;
  }

  async open_game(game_id) {
    const id = String(game_id || '').trim();
    const stored = (this.app.options?.games || []).find((game) => game.id === id);
    if (!stored) {
      throw new Error('No local game has that id');
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
      context = game_mod.returnContext?.() ?? null;
    } catch (err) {
      context_error = err?.message || 'returnContext() failed';
    }

    const clickable_items = this.mod.jsdom.get_clickable_items();
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
