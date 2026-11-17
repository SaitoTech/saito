const Transaction = require('../../../lib/saito/transaction').default;

const LOG_LIMIT = 30;

function decodeParam(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

function parseInvitation(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    return null;
  }

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.t || parsed.signature || parsed.msg)) {
        return { serialized: raw };
      }
    } catch (err) {
      return null;
    }
  }

  let gameId = '';
  let game = '';
  try {
    const url = new URL(raw, 'https://gamebot.local');
    gameId = url.searchParams.get('game_id') || '';
    game = url.searchParams.get('game') || '';
  } catch (err) {
    gameId = '';
  }

  if (!gameId) {
    const idMatch = raw.match(/game_id=([^&\s]+)/);
    const gameMatch = raw.match(/(?:^|[?&])game=([^&\s]+)/);
    if (idMatch) {
      gameId = decodeParam(idMatch[1]);
      game = gameMatch ? decodeParam(gameMatch[1]) : '';
    }
  }

  if (!gameId && /^[A-Za-z0-9+/=_-]{16,}$/.test(raw)) {
    gameId = raw;
  }

  if (!gameId) {
    return null;
  }

  return {
    game_id: decodeParam(gameId),
    game: decodeParam(game)
  };
}

function plain(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

class Manager {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.logs = {};
    this.onChange = null;
    this.onNote = null;
    this.listening = false;
  }

  async initialize() {
    this.ensure();
    this.watchInstalledGames();
    this.listen();
    this.sync();
  }

  ensure() {
    if (!this.app.options) {
      this.app.options = {};
    }
    if (!this.app.options.gamebot) {
      this.app.options.gamebot = {};
    }
    if (!this.app.options.gamebot.games) {
      this.app.options.gamebot.games = {};
    }
    return this.app.options.gamebot.games;
  }

  save() {
    this.app.storage?.saveOptions?.();
  }

  gameIdFromHash() {
    if (typeof window === 'undefined') {
      return '';
    }
    const raw = String(window.location.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(raw);
    return params.get('gid') || '';
  }

  records() {
    return Object.values(this.ensure()).sort((a, b) => (b.accepted_at || 0) - (a.accepted_at || 0));
  }

  gameModule(name) {
    if (!name) {
      return null;
    }
    return (
      this.app.modules.returnModule(name) ||
      this.app.modules.returnModuleBySlug?.(name) ||
      null
    );
  }

  watchInstalledGames() {
    const mods = this.app.modules?.mods || [];
    for (const gameMod of mods) {
      if (gameMod?.hud) {
        this.mod.dom.watch(gameMod);
        this.watchSaves(gameMod);
      }
    }
  }

  watchSaves(gameMod) {
    if (!gameMod || gameMod.gamebotSaveWrapped || typeof gameMod.saveGame !== 'function') {
      return;
    }
    const save = gameMod.saveGame.bind(gameMod);
    gameMod.saveGame = (gameId) => {
      const result = save(gameId);
      try {
        this.onGameSaved(gameMod, gameId);
      } catch (err) {
        console.error('GameBot could not record the saved game', err);
      }
      return result;
    };
    gameMod.gamebotSaveWrapped = true;
  }

  listen() {
    if (this.listening) {
      return;
    }
    this.listening = true;

    this.app.connection.on('arcade-notify-player-turn', (gameId, target, status) => {
      const record = this.ensure()[gameId];
      if (!record) {
        return;
      }
      record.target = target;
      this.append(gameId, {
        kind: 'activity',
        text: plain(status) || 'turn notice',
        target
      });
      this.sync();
    });

    this.app.connection.on('arcade-invite-manager-render-request', () => {
      this.sync();
    });

    this.app.connection.on('chat-popup-render-request', (group) => {
      this.noteChat(group);
    });
  }

  noteChat(group) {
    const members = group?.members || [];
    if (!members.length) {
      return;
    }
    const games = this.app.options?.games || [];
    for (const record of this.records()) {
      const live = games.find((game) => game.id === record.id);
      const players = live?.players || live?.accepted || [];
      const involved = players.some(
        (key) => members.includes(key) && key !== this.mod.publicKey
      );
      if (!involved) {
        continue;
      }
      this.append(record.id, {
        kind: 'activity',
        text: 'chat: ' + (plain(latestChat(group)) || 'message')
      });
    }
  }

  async acceptInvitation(text) {
    const arcade = this.app.modules.returnModule('Arcade');
    if (!arcade) {
      throw new Error('Arcade is not installed');
    }

    const parsed = parseInvitation(text);
    if (!parsed) {
      throw new Error('Paste an Arcade invite link or a game id');
    }

    let gameTx = null;
    if (parsed.serialized) {
      gameTx = new Transaction();
      gameTx.deserialize_from_web(this.app, parsed.serialized);
      if (!gameTx.signature) {
        throw new Error('That text is not a game invitation');
      }
    } else {
      const found = await arcade.returnGameInvite(parsed.game_id, parsed.game);
      if (!found?.game_tx) {
        throw new Error('No invitation found for that link');
      }
      if (found.from_archive) {
        throw new Error('That id is archived history, not an open invitation');
      }
      gameTx = found.game_tx;
    }

    const message = gameTx.returnMessage?.() || gameTx.msg;
    if (!message?.game) {
      throw new Error('The invitation has no game module');
    }

    const gameMod = this.gameModule(message.game);
    if (!gameMod) {
      throw new Error(message.game + ' is not installed on this node');
    }
    this.mod.dom.watch(gameMod);
    this.watchSaves(gameMod);

    const openTable = message.request === 'active' && message.options?.['open-table'];
    if (openTable) {
      if (typeof gameMod.requestSeatAtTable !== 'function') {
        throw new Error('This open table cannot be joined from GameBot');
      }
      await gameMod.requestSeatAtTable(gameTx);
    } else if (typeof arcade.isAvailableGame === 'function' && !arcade.isAvailableGame(gameTx)) {
      throw new Error('That invitation is not open (' + (message.request || 'unknown') + ')');
    } else {
      if (message.options && typeof message.options === 'object') {
        message.options.desired_opponent_publickey = this.mod.publicKey;
      }
      arcade.addInviteRecord?.(gameTx);
      await arcade.sendJoinTransaction({ tx: gameTx });
    }

    const id = gameTx.signature;
    const records = this.ensure();
    records[id] = {
      id,
      module: message.game,
      status: 'joining',
      accepted_at: Date.now()
    };
    this.save();
    this.sync();
    this.onChange?.();
    return records[id];
  }

  async cancel(gameId) {
    const record = this.ensure()[gameId];
    if (!record) {
      throw new Error('GameBot is not tracking that game');
    }
    const arcade = this.app.modules.returnModule('Arcade');
    if (!arcade?.sendCancelTransaction) {
      throw new Error('Arcade cannot cancel this invitation');
    }
    if (arcade.returnGame && !arcade.returnGame(gameId)) {
      throw new Error('Arcade does not have that invitation');
    }
    await arcade.sendCancelTransaction(gameId);
    record.status = 'cancelled';
    this.save();
    this.onChange?.();
  }

  async forfeit(gameId) {
    const record = this.ensure()[gameId];
    if (!record) {
      throw new Error('GameBot is not tracking that game');
    }
    const gameMod = this.gameModule(record.module);
    if (!gameMod) {
      throw new Error(record.module + ' is not installed');
    }
    this.app.connection.emit('arcade-stop-game', gameMod.name, gameId, 'forfeit');
    record.status = 'forfeit';
    this.save();
    this.onChange?.();
  }

  sync() {
    const records = this.ensure();
    let changed = false;
    for (const game of this.app.options?.games || []) {
      const record = records[game.id];
      if (!record) {
        continue;
      }
      const status = game.over ? 'over' : 'active';
      if (record.status !== status && record.status !== 'forfeit' && record.status !== 'cancelled') {
        record.status = status;
        record.module = game.module || record.module;
        changed = true;
      }
      record.target = game.target;
      record.player = game.player;
    }
    if (changed) {
      this.save();
      this.onChange?.();
    }
  }

  onGameSaved(gameMod, gameId) {
    const record = this.ensure()[gameId];
    if (!record || !gameMod?.game || gameMod.game.id !== gameId) {
      return;
    }
    const status = gameMod.game.over ? 'over' : 'active';
    if (record.status !== status && record.status !== 'forfeit' && record.status !== 'cancelled') {
      record.status = status;
      this.save();
      this.onChange?.();
    }
    const analysis = this.mod.ai.analyseMove(gameMod, this.mod.dom.interactions(gameMod));
    this.append(gameId, { kind: 'context', analysis });
  }

  log(gameId) {
    if (!this.logs[gameId]) {
      this.logs[gameId] = [];
    }
    return this.logs[gameId];
  }

  append(gameId, entry) {
    const log = this.log(gameId);
    if (entry.kind === 'activity') {
      const previous = log[log.length - 1];
      if (previous?.kind === 'activity' && previous.text === entry.text) {
        return previous;
      }
    }
    if (entry.kind === 'context') {
      let serialized = null;
      try {
        serialized = JSON.stringify(entry.analysis?.context ?? null);
      } catch (err) {
        serialized = null;
      }
      if (serialized != null) {
        const previous = [...log].reverse().find((item) => item.kind === 'context');
        if (previous && previous.serialized === serialized) {
          return previous;
        }
        entry.serialized = serialized;
      }
    }
    entry.seq = log.length + 1;
    entry.at = new Date().toISOString();
    log.push(entry);
    if (log.length > LOG_LIMIT) {
      log.splice(0, log.length - LOG_LIMIT);
    }
    this.onNote?.(gameId, entry);
    return entry;
  }

  captureContext(gameId) {
    const record = this.ensure()[gameId];
    if (!record) {
      return null;
    }
    const gameMod = this.gameModule(record.module);
    if (!gameMod) {
      return null;
    }
    this.mod.dom.watch(gameMod);
    this.watchSaves(gameMod);
    const live = (this.app.options?.games || []).find((game) => game.id === gameId);
    if (live && gameMod.game?.id !== gameId && typeof gameMod.loadGame === 'function') {
      gameMod.loadGame(gameId);
    }
    if (gameMod.game?.id !== gameId) {
      return { record, gameMod, analysis: null };
    }
    const analysis = this.mod.ai.analyseMove(gameMod, this.mod.dom.interactions(gameMod));
    this.append(gameId, { kind: 'context', analysis });
    return { record, gameMod, analysis };
  }
}

function latestChat(group) {
  const txs = group?.txs;
  if (!Array.isArray(txs) || !txs.length) {
    return '';
  }
  const last = txs[txs.length - 1];
  if (typeof last === 'string') {
    return last;
  }
  if (typeof last?.message === 'string') {
    return last.message;
  }
  if (typeof last?.msg === 'string') {
    return last.msg;
  }
  if (typeof last?.msg?.message === 'string') {
    return last.msg.message;
  }
  return '';
}

module.exports = Manager;
module.exports.parseInvitation = parseInvitation;
