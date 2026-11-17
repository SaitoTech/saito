const GameTemplate = require('../../../lib/templates/gametemplate');
const GameObserver = require('../../../lib/saito/ui/game-observer/game-observer');
const LoungeOverlayTemplate = require('../../../mods/arcade/lib/ui/overlays/lounge.template');
const Wordblocks = require('../../../mods/wordblocks/wordblocks');

function gameRecord(id) {
  return {
    id: id,
    module: 'Chess',
    queue: [],
    future: [],
    step: { game: 1, players: { pk: 1 } },
    players: ['pk']
  };
}

function loadableModule(records) {
  const mod = Object.create(GameTemplate.prototype);
  mod.app = {
    BROWSER: 1,
    options: { games: [] },
    storage: {
      loadDataFile: async (namespace, id) => {
        if (records[id] === undefined) {
          return null;
        }
        return records[id];
      }
    }
  };
  mod.name = 'Chess';
  mod.game = null;
  mod.snapshot = [];
  mod._load_token = 0;
  mod._activation_hold = 0;
  mod.newGame = (id) => gameRecord(id);
  mod.saveGame = async function () {
    return this.game && this.game.id;
  };
  return mod;
}

function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('addNextMove resumes game A after game B takes the active slot during the save', async () => {
  const game_a = {
    id: 'a',
    queue: [],
    future: ['pending'],
    step: { game: 1, players: { pk: 1 }, timestamp: 1 },
    players: ['pk'],
    turn: ['old'],
    initialize_game_run: 1,
    player: 1
  };
  const game_b = {
    id: 'b',
    queue: ['b-only'],
    future: ['b-future'],
    step: { game: 4, players: { pk: 4 } },
    players: ['pk'],
    turn: [],
    initialize_game_run: 1
  };
  const mod = loadableModule({});
  mod.game = game_a;
  mod.halted = 0;
  mod.gaming_active = 0;
  mod.browser_active = 1;
  mod.gameBrowserActive = () => false;
  mod.stopClock = () => {};
  mod.app.keychain = { returnUsername: () => 'player' };
  const gate = deferred();
  const saved = [];
  const started = [];
  mod.saveFutureMoves = () => gate.promise;
  mod.saveGame = function (id) {
    saved.push({ id: id, active: this.game.id, queue: this.game.queue.slice(), object: this.game });
  };
  mod.startQueue = async function () {
    started.push({ id: this.game.id, queue: this.game.queue.slice(), object: this.game });
  };
  mod.loadGame = async function (id) {
    if (id === 'a') {
      this.game = {
        id: 'a',
        queue: [],
        future: ['from-disk'],
        step: { game: 1, players: { pk: 1 } },
        turn: []
      };
    }
    return this.game;
  };

  const pending = mod.addNextMove({
    from: [{ publicKey: 'pk' }],
    returnMessage() {
      return { step: { game: 2, timestamp: 9 }, turn: ['PLAY\tcard'] };
    }
  });
  await Promise.resolve();
  mod.game = game_b;
  gate.release();
  await pending;

  expect(game_a.queue).toEqual(['PLAY\tcard']);
  expect(mod.game).toBe(game_a);
  expect(saved).toEqual([{ id: 'a', active: 'a', queue: ['PLAY\tcard'], object: game_a }]);
  expect(started).toEqual([{ id: 'a', queue: ['PLAY\tcard'], object: game_a }]);
  expect(game_b.queue).toEqual(['b-only']);
  expect(game_b.future).toEqual(['b-future']);
});

test('an older loadGame does not replace a newer active game', async () => {
  const gates = { a: deferred(), b: deferred() };
  const mod = loadableModule({});
  mod.app.storage.loadDataFile = async (namespace, id) => {
    await gates[id].promise;
    return gameRecord(id);
  };

  const seen = [];
  const loaded_a = mod.loadGame('a').then((game) => {
    seen.push({ caller: 'a', returned: game.id, active: mod.game.id });
    return game;
  });
  const loaded_b = mod.loadGame('b').then((game) => {
    seen.push({ caller: 'b', returned: game.id, active: mod.game.id });
    return game;
  });

  gates.b.release();
  const game_b = await loaded_b;
  expect(game_b.id).toBe('b');
  expect(mod.game.id).toBe('b');

  gates.a.release();
  const game_a = await loaded_a;
  expect(game_a.id).toBe('a');
  expect(mod.game.id).toBe('b');
  expect(seen).toEqual([
    { caller: 'b', returned: 'b', active: 'b' },
    { caller: 'a', returned: 'a', active: 'b' }
  ]);
});

test('each loadGame caller observes its own record when that load is still the latest', async () => {
  const gates = { a: deferred(), b: deferred() };
  const mod = loadableModule({});
  mod.app.storage.loadDataFile = async (namespace, id) => {
    await gates[id].promise;
    return gameRecord(id);
  };

  const loaded_a = mod.loadGame('a').then((game) => {
    return { returned: game.id, active: mod.game.id };
  });
  gates.a.release();
  await expect(loaded_a).resolves.toEqual({ returned: 'a', active: 'a' });
  expect(mod.game.id).toBe('a');

  const loaded_b = mod.loadGame('b').then((game) => {
    return { returned: game.id, active: mod.game.id };
  });
  gates.b.release();
  await expect(loaded_b).resolves.toEqual({ returned: 'b', active: 'b' });
  expect(mod.game.id).toBe('b');
});

test('a superseded create does not stay active and still saves the created game', async () => {
  const save_gate = deferred();
  const mod = loadableModule({ b: gameRecord('b') });
  const saved = [];
  mod.app.storage.loadDataFile = async (namespace, id) => {
    if (id === 'a') {
      return null;
    }
    return gameRecord('b');
  };
  mod.saveGame = function () {
    saved.push(this.game.id);
    return save_gate.promise;
  };

  const created = mod.loadGame('a');
  await Promise.resolve();
  await Promise.resolve();
  const loaded_b = await mod.loadGame('b');
  expect(loaded_b.id).toBe('b');
  expect(mod.game.id).toBe('b');

  save_gate.release();
  await expect(created).resolves.toMatchObject({ id: 'a' });
  expect(saved).toEqual(['a']);
  expect(mod.game.id).toBe('b');
});

test('a missing id is still created and activated', async () => {
  const mod = loadableModule({});
  const saved = [];
  mod.saveGame = function () {
    saved.push(this.game.id);
  };
  const created = await mod.loadGame('fresh');
  expect(created.id).toBe('fresh');
  expect(mod.game.id).toBe('fresh');
  expect(saved).toEqual(['fresh']);
});

function relayModule(records) {
  const mod = loadableModule(records);
  const calls = [];
  mod.calls = calls;
  mod.doesGameExistLocally = async (id) => {
    return records[id] ? 1 : 0;
  };
  mod.addFutureMove = async () => {
    calls.push('future:' + mod.game.id);
  };
  mod.addNextMove = async () => {
    calls.push('next:' + mod.game.id);
  };
  mod.notifyMove = () => {};
  mod.isUnprocessedMove = () => 0;
  mod.newGame = () => {
    throw new Error('relay created a game');
  };
  return mod;
}

function relayMove(game_id) {
  return {
    tx: { from: [{ publicKey: 'pk' }] },
    msg: { game_id: game_id, step: { game: 3 } }
  };
}

test('a relay for a known game activates it when nothing is active', async () => {
  const mod = relayModule({ known: gameRecord('known') });
  mod.game = {};
  const move = relayMove('known');
  await mod.receiveRelayMovesReturn(move.tx, move.msg);
  expect(mod.calls).toEqual(['future:known']);
  expect(mod.game.id).toBe('known');
});

test('a relay for a known game restores the previous active game', async () => {
  const mod = relayModule({
    known: gameRecord('known'),
    intruder: gameRecord('intruder')
  });
  const previous = gameRecord('previous');
  mod.game = previous;
  mod.addFutureMove = async () => {
    mod.calls.push('during:' + mod.game.id);
    await mod.loadGame('intruder');
    mod.calls.push('during-after-load:' + mod.game.id);
  };
  const move = relayMove('known');
  await mod.receiveRelayMovesReturn(move.tx, move.msg);
  expect(mod.calls).toEqual(['during:known', 'during-after-load:known']);
  expect(mod.game).toBe(previous);
});

test('an unknown relay does not create a game when nothing is active', async () => {
  const mod = relayModule({});
  mod.game = null;
  const move = relayMove('missing');
  await mod.receiveRelayMovesReturn(move.tx, move.msg);
  expect(mod.game).toBeNull();
  expect(mod.calls).toEqual([]);
});

test('a rejected relay releases the hold and restores the previous game', async () => {
  const mod = relayModule({ known: gameRecord('known') });
  const previous = gameRecord('previous');
  mod.game = previous;
  mod.addFutureMove = async () => {
    throw new Error('relay failed');
  };
  const move = relayMove('known');
  await expect(mod.receiveRelayMovesReturn(move.tx, move.msg)).rejects.toThrow('relay failed');
  expect(mod._activation_hold).toBe(0);
  expect(mod.game).toBe(previous);

  const later = await mod.loadGame('known');
  expect(later.id).toBe('known');
  expect(mod.game.id).toBe('known');
});

test('relay restoration leaves a newer active game in place', async () => {
  const mod = relayModule({ known: gameRecord('known') });
  const previous = gameRecord('previous');
  const newer = gameRecord('newer');
  mod.game = previous;
  mod.addFutureMove = async () => {
    mod.calls.push('during:' + mod.game.id);
    mod.game = newer;
  };
  const move = relayMove('known');
  await mod.receiveRelayMovesReturn(move.tx, move.msg);
  expect(mod.calls).toEqual(['during:known']);
  expect(mod.game).toBe(newer);
  expect(mod._activation_hold).toBe(0);
});

test('an unknown relay leaves a different active game in place', async () => {
  const mod = relayModule({});
  const previous = gameRecord('previous');
  mod.game = previous;
  const move = relayMove('missing');
  await mod.receiveRelayMovesReturn(move.tx, move.msg);
  expect(mod.game).toBe(previous);
  expect(mod.calls).toEqual([]);
});

test('GameObserver waits for loadGame and stubs only a missing result', async () => {
  const gate = deferred();
  const game_mod = {
    browser_active: false,
    game: null,
    loadGame() {
      return gate.promise;
    }
  };
  const observer = new GameObserver({}, game_mod);
  let finished = false;
  const pending = observer.initialize('obs').then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(game_mod.game).toBeNull();

  gate.release(null);
  await pending;
  expect(game_mod.game.id).toBe('obs');
  expect(game_mod.game.queue).toEqual([]);

  const kept = { id: 'kept', future: ['move'] };
  game_mod.game = kept;
  game_mod.loadGame = async () => kept;
  await observer.initialize('kept');
  expect(game_mod.game).toBe(kept);
  expect(game_mod.game.future).toEqual(['move']);
});

function loungeInvite(exists) {
  return {
    game_mod: {
      respondTo() {
        return { image: '' };
      },
      returnShortGameOptionsArray() {
        return {};
      },
      doesGameExistLocally() {
        return exists.promise;
      },
      enable_observer: true
    },
    tentative: { join: [], leave: [] },
    time_finished: 10,
    players: ['a'],
    players_needed: 2,
    desired_opponent_publickeys: [],
    empty_slots: 0,
    game_name: 'Chess',
    game_id: 'g1',
    step: 2,
    options: {}
  };
}

function loungeApp() {
  return {
    keychain: { returnIdenticon() { return ''; } },
    browser: {
      returnAddressHTML() { return ''; },
      escapeHTML(value) { return value; },
      formatDate() {
        return { hours: '1', minutes: '2', day: '3', month: 'May' };
      }
    }
  };
}

test('the lounge waits for the local existence check before choosing controls', async () => {
  const exists = deferred();
  const pending = LoungeOverlayTemplate(loungeApp(), { publicKey: 'me' }, loungeInvite(exists));
  let html = '';
  let finished = false;
  pending.then((value) => {
    html = value;
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);

  exists.release(0);
  await pending;
  expect(html).toContain('arcade-game-controls-review-game');
  expect(html).not.toContain('arcade-game-controls-continue-game');

  const present = deferred();
  const viewing = LoungeOverlayTemplate(loungeApp(), { publicKey: 'me' }, loungeInvite(present));
  present.release(1);
  const view_html = await viewing;
  expect(view_html).toContain('arcade-game-controls-continue-game');
  expect(view_html).toContain('view game');
});

test('wordblocks returns from the queue only after saveGame resolves', async () => {
  const gate = deferred();
  const game = Object.create(Wordblocks.prototype);
  const order = [];
  game.loadingDictionary = false;
  game.game = {
    id: 'w1',
    queue: [],
    player: 1,
    target: 2,
    playerNames: ['a', 'b']
  };
  game.gameBrowserActive = () => false;
  game.updateStatusWithTiles = () => {};
  game.startClock = () => {};
  game.playerbox = { setActive() {} };
  game.saveGame = () => {
    order.push('save-start');
    return gate.promise.then(() => {
      order.push('save-done');
    });
  };
  global.$ = () => ({
    removeClass() { return this; },
    addClass() { return this; }
  });

  let code = null;
  const pending = game.handleGameLoop().then((value) => {
    code = value;
    order.push('returned');
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(code).toBeNull();
  expect(order).toEqual(['save-start']);

  gate.release();
  await pending;
  expect(code).toBe(1);
  expect(order).toEqual(['save-start', 'save-done', 'returned']);
});

async function fasterPlayCallback(GameClass) {
  const game = Object.create(GameClass.prototype);
  game.publicKey = 'pk';
  game.faster_play = 1;
  game.halted = 0;
  game.is_first_loop = 1;
  game.game = {
    id: 'game-a',
    queue: ['counter_or_acknowledge\thello'],
    player: 1,
    confirms_needed: [1],
    players: ['pk'],
    state: {},
    status: '',
    tmp_confirm_sent: 0
  };
  game.returnEventObjects = () => [];
  game.hasMyResolvePending = async () => false;
  game.isGameHalted = () => 0;
  game.addMove = () => {};
  game.endTurn = () => {};
  game.processFutureMoves = async () => {};
  game.cardbox = { hide() {}, attachCardEvents() {}, bindCallback() {} };
  let callback = null;
  game.hud = {
    hideBackButton() {},
    updateStatus() {},
    updateCards() {},
    updateMenu(html, cb) {
      callback = cb;
    }
  };
  await game.handleGameLoop();
  return { game, callback };
}

test('Here I Stand waits for the restored game before writing its status', async () => {
  const HereIStand = require('../../../mods/his/his');
  global.$ = () => ({ off() {} });
  const { game, callback } = await fasterPlayCallback(HereIStand);
  expect(typeof callback).toBe('function');

  const gate = deferred();
  game.loadGame = (id) => {
    return gate.promise.then(() => {
      game.game = { id: id, status: 'loaded' };
      return game.game;
    });
  };
  game.game = { id: 'other', status: 'untouched' };

  let finished = false;
  const pending = Promise.resolve(callback('ok')).then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  expect(game.game.status).toBe('untouched');

  gate.release();
  await pending;
  expect(game.game.id).toBe('game-a');
  expect(game.game.status).toBe('continuing...');
  expect(game.halted).toBe(0);
});

test('Here I Stand does not run future moves on a game that took over during the delay', async () => {
  jest.useFakeTimers();
  try {
    const HereIStand = require('../../../mods/his/his');
    global.$ = () => ({ off() {} });
    const { game, callback } = await fasterPlayCallback(HereIStand);
    const ran = [];
    game.processFutureMoves = async () => {
      ran.push(game.game.id);
    };
    const gate = deferred();
    game.loadGame = (id) => {
      return gate.promise.then(() => {
        game.game = { id: id, status: 'loaded' };
        return game.game;
      });
    };
    game.game = { id: 'other', status: 'untouched' };
    const pending = callback('ok');
    gate.release();
    await pending;
    expect(game.game.status).toBe('continuing...');

    game.game = { id: 'newer', status: 'stay' };
    game.loadGame = async () => {
      return { id: 'game-a' };
    };
    jest.advanceTimersByTime(5);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(ran).toEqual([]);
    expect(game.game.id).toBe('newer');
  } finally {
    jest.useRealTimers();
  }
});

test('Realms waits for the restored game before writing its status', async () => {
  const Realms = require('../../../mods/realms/realms');
  global.$ = () => ({ off() {} });
  const { game, callback } = await fasterPlayCallback(Realms);
  expect(typeof callback).toBe('function');

  const gate = deferred();
  game.loadGame = (id) => {
    return gate.promise.then(() => {
      game.game = { id: id, status: 'loaded' };
      return game.game;
    });
  };
  game.game = { id: 'other', status: 'untouched' };

  const pending = callback('ok');
  await Promise.resolve();
  expect(game.game.status).toBe('untouched');
  gate.release();
  await pending;
  expect(game.game.id).toBe('game-a');
  expect(game.game.status).toBe('continuing...');
  expect(game.halted).toBe(0);
});

function stableQueueModule(game) {
  const events = [];
  const mod = Object.create(GameTemplate.prototype);
  mod.app = {
    connection: {
      emit(name, payload) {
        events.push({ name, payload });
      }
    }
  };
  mod.game = game;
  mod.halted = 0;
  mod.deferred_game_end = [];
  mod.events = events;
  return mod;
}

test('processFutureMoves emits game-queue-stable when nothing else is executable', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 1,
    over: 0,
    step: { game: 1 }
  });

  const result = await mod.processFutureMoves();

  expect(result).toBe(0);
  expect(mod.events).toEqual([
    { name: 'game-queue-stable', payload: { game_id: 'game-a' } }
  ]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
});

test('processFutureMoves emits when the queue is halted and the game is initialized', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 1
  });
  mod.halted = 1;

  const result = await mod.processFutureMoves();

  expect(result).toBe(-1);
  expect(mod.events).toEqual([
    { name: 'game-queue-stable', payload: { game_id: 'game-a' } }
  ]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
});

test('processFutureMoves does not emit when the game is uninitialized', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 0
  });
  mod.halted = 1;

  const result = await mod.processFutureMoves();

  expect(result).toBe(-1);
  expect(mod.events).toEqual([]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
});

test('processFutureMoves reports the game it started with after an await switches this.game', async () => {
  const game_a = {
    id: 'game-a',
    future: [],
    initialize_game_run: 1,
    over: 0,
    step: { game: 1 }
  };
  const mod = stableQueueModule(game_a);
  mod.deferred_game_end = [{}];
  mod.processDeferredGameEndTransactions = async function () {
    this.game = { id: 'game-b', future: [], initialize_game_run: 1, over: 0, step: { game: 1 } };
  };
  mod.loadGame = async () => {};

  const result = await mod.processFutureMoves();

  expect(result).toBe(0);
  expect(mod.game.id).toBe('game-a');
  expect(mod.events).toEqual([
    { name: 'game-queue-stable', payload: { game_id: 'game-a' } }
  ]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
});

test('processFutureMoves does not emit for a deferred game-over', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 1,
    over: 0,
    step: { game: 1 }
  });
  mod.deferred_game_end = [{}];
  mod.processDeferredGameEndTransactions = async function () {
    this.game.over = 1;
  };

  const result = await mod.processFutureMoves();

  expect(result).toBe(0);
  expect(mod.events).toEqual([]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
});

test('nested processFutureMoves calls emit once for the same game', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 1,
    over: 0,
    step: { game: 1 }
  });
  mod.deferred_game_end = [{}];
  mod.processDeferredGameEndTransactions = async function () {
    this.deferred_game_end = [];
    await this.processFutureMoves();
  };

  const result = await mod.processFutureMoves();

  expect(result).toBe(0);
  expect(mod.events).toEqual([
    { name: 'game-queue-stable', payload: { game_id: 'game-a' } }
  ]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
});

test('independent games keep independent processFutureMoves depth', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 1,
    over: 0,
    step: { game: 1 }
  });
  mod.deferred_game_end = [{}];
  mod.loadGame = async () => {};
  mod.processDeferredGameEndTransactions = async function () {
    this.deferred_game_end = [];
    this.game = {
      id: 'game-b',
      future: [],
      initialize_game_run: 1,
      over: 0,
      step: { game: 1 }
    };
    await this.processFutureMoves();
  };

  const result = await mod.processFutureMoves();

  expect(result).toBe(0);
  expect(mod.events).toEqual([
    { name: 'game-queue-stable', payload: { game_id: 'game-b' } },
    { name: 'game-queue-stable', payload: { game_id: 'game-a' } }
  ]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
  expect(mod.process_future_moves_depth['game-b']).toBe(0);
});

test('processFutureMoves does not emit when future-move processing throws', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 1,
    over: 0,
    step: { game: 1 }
  });
  mod.deferred_game_end = [{}];
  mod.processDeferredGameEndTransactions = async () => {
    throw new Error('boom');
  };

  await expect(mod.processFutureMoves()).rejects.toThrow('boom');
  expect(mod.events).toEqual([]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
  expect(mod.process_future_moves_boundary['game-a']).toBe(false);
});

function withFutureMove(run) {
  const entries = Object.keys(require.cache)
    .filter((item) => item.includes('/lib/saito/transaction.'))
    .map((item) => require.cache[item].exports.default)
    .filter((Transaction) => Transaction && Transaction.prototype.deserialize_from_web);
  const originals = entries.map((Transaction) => {
    const SaitoTransaction = Object.getPrototypeOf(Transaction);
    const saved = {
      Transaction,
      SaitoTransaction,
      type: SaitoTransaction.Type,
      deserialize: Transaction.prototype.deserialize_from_web
    };
    SaitoTransaction.Type = function FakeWasmTransaction() {
      this.data = new Uint8Array(0);
      this.type = 99;
      this.from = [{}];
    };
    Transaction.prototype.deserialize_from_web = function () {
      Object.defineProperty(this, 'from', {
        configurable: true,
        value: [{ publicKey: 'pk' }]
      });
      this.returnMessage = () => ({ step: { game: 2 }, turn: ['PLAY'] });
    };
    return saved;
  });
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const saved of originals) {
        saved.SaitoTransaction.Type = saved.type;
        saved.Transaction.prototype.deserialize_from_web = saved.deserialize;
      }
    });
}

test('addNextMove early return does not emit game-queue-stable', async () => {
  await withFutureMove(async () => {
    const mod = stableQueueModule({
      id: 'game-a',
      future: ['future-move'],
      initialize_game_run: 1,
      over: 0,
      step: { game: 1, players: {} },
      players: ['pk'],
      queue: []
    });
    let parked = false;
    mod.isUnprocessedMove = function () {
      this.halted = 1;
      return 1;
    };
    mod.addFutureMove = async () => {
      parked = true;
    };

    const result = await mod.processFutureMoves();

    expect(parked).toBe(true);
    expect(result).toBe(1);
    expect(mod.events).toEqual([]);
    expect(mod.process_future_moves_depth['game-a']).toBe(0);
    expect(mod.process_future_moves_boundary['game-a']).toBe(false);
  });
});

test('a boundary from the deepest of three calls is emitted once', async () => {
  await withFutureMove(async () => {
    const mod = stableQueueModule({
      id: 'game-a',
      future: ['future-move'],
      initialize_game_run: 1,
      over: 0,
      step: { game: 1, players: {} },
      players: ['pk'],
      queue: []
    });
    let seen = 0;
    mod.isUnprocessedMove = () => {
      seen += 1;
      return seen < 3;
    };
    mod.isFutureMove = () => 0;
    mod.saveFutureMoves = async () => {};
    mod.addNextMove = async function () {
      this.game.future = ['future-move'];
      await this.processFutureMoves();
    };

    const result = await mod.processFutureMoves();

    expect(result).toBe(1);
    expect(seen).toBe(3);
    expect(mod.events).toEqual([
      { name: 'game-queue-stable', payload: { game_id: 'game-a' } }
    ]);
    expect(mod.process_future_moves_depth['game-a']).toBe(0);
    expect(mod.process_future_moves_boundary['game-a']).toBe(false);
  });
});

test('outermost deferred game-over does not emit even after a nested boundary', async () => {
  const mod = stableQueueModule({
    id: 'game-a',
    future: [],
    initialize_game_run: 1,
    over: 0,
    step: { game: 1 }
  });
  mod.deferred_game_end = [{}];
  mod.processDeferredGameEndTransactions = async function () {
    this.deferred_game_end = [];
    await this.processFutureMoves();
    this.game.over = 1;
  };

  const result = await mod.processFutureMoves();

  expect(result).toBe(0);
  expect(mod.events).toEqual([]);
  expect(mod.process_future_moves_depth['game-a']).toBe(0);
  expect(mod.process_future_moves_boundary['game-a']).toBe(false);
});
