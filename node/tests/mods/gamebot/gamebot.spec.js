const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const Manager = require('../../../mods/gamebot/lib/manager');
const GameTemplate = require('../../../lib/templates/gametemplate');
const GameHUD2 = require('../../../lib/saito/ui/game-hud2/game-hud2');
const GameCardbox = require('../../../lib/saito/ui/game-cardbox/game-cardbox');
const AI = require('../../../mods/gamebot/lib/ai');
const GameDom = require('../../../mods/gamebot/lib/jsdom');
const Main = require('../../../mods/gamebot/lib/ui/main');
const Game = require('../../../mods/gamebot/lib/ui/game');

const INVITE = 'https://saito.io/arcade/?game=chess&game_id=abcDEF1234567890&invite=1';

function inviteTx() {
  return {
    signature: 'abcDEF1234567890',
    msg: { game: 'Chess', request: 'open', options: {} },
    returnMessage() {
      return this.msg;
    }
  };
}

function harness(extra = {}) {
  const clicks = [];
  const app = {
    BROWSER: 1,
    options: { games: [] },
    crypto: {
      hash(value) {
        return 'hash:' + String(value);
      }
    },
    connection: new EventEmitter(),
    modules: {
      mods: [],
      returnModule(name) {
        if (name === 'Arcade') {
          return extra.arcade || null;
        }
        if (name === 'Chess') {
          return extra.chess || null;
        }
        if (name === 'Go') {
          return extra.go || null;
        }
        return null;
      }
    }
  };
  if (extra.chess) {
    app.modules.mods.push(extra.chess);
  }
  if (extra.go) {
    app.modules.mods.push(extra.go);
  }
  const mod = { publicKey: 'player-key', app };
  mod.ai = extra.ai || new AI(app, mod);
  mod.jsdom = extra.jsdom || new GameDom(app, mod);
  mod.jsdom.mod = mod;
  const manager = new Manager(app, mod);
  mod.manager = manager;
  if (extra.chess?.game?.id) {
    manager.active_game_mod = extra.chess;
  }
  mod.game_screen = new Game(app, mod);
  mod.jsdom.executeClick = extra.track_clicks
    ? async (identifier) => {
        clicks.push(identifier);
        return GameDom.prototype.executeClick.call(mod.jsdom, identifier);
      }
    : mod.jsdom.executeClick.bind(mod.jsdom);
  return { app, mod, manager, clicks };
}

function gameModule(name, id, document) {
  const dom = document ? new JSDOM(document) : null;
  return {
    name,
    slug: name.toLowerCase(),
    game: { id, initializing: 0 },
    jsdom: dom ? { window: dom.window } : null,
    returnContext() {
      return { game: { id: this.game.id, module: name } };
    },
    loadGame(loaded_id) {
      this.game = { id: loaded_id, initializing: 0 };
      return this.game;
    }
  };
}

describe('GameBot manager', () => {
  test('acceptGame joins a valid invitation and hears a ready event emitted during the join', async () => {
    const tx = inviteTx();
    const joined = [];
    const { app, manager } = harness({
      chess: gameModule('Chess', '', ''),
      arcade: {
        returnGameInvite: async () => ({ game_tx: tx, from_archive: false }),
        isAvailableGame: () => true,
        addInviteRecord() {},
        sendJoinTransaction: async () => {
          joined.push(tx.signature);
          app.connection.emit('arcade-game-ready-render-request', { id: 'other-game' });
          app.connection.emit('arcade-game-ready-render-request', { id: tx.signature });
        }
      }
    });

    const game_id = await Promise.race([
      manager.acceptGame(INVITE),
      new Promise((_, reject) => setTimeout(() => reject(new Error('missed ready event')), 500))
    ]);

    expect(game_id).toBe('abcDEF1234567890');
    expect(joined).toEqual(['abcDEF1234567890']);
    expect(tx.msg.options.desired_opponent_publickey).toBe('player-key');
    expect(app.connection.listenerCount('arcade-game-ready-render-request')).toBe(0);
  });

  test('acceptGame rejects an unusable link, a closed invitation, and a failed join', async () => {
    const tx = inviteTx();
    const { app, manager } = harness({
      chess: gameModule('Chess', '', ''),
      arcade: {
        returnGameInvite: async () => ({ game_tx: tx, from_archive: false }),
        isAvailableGame: () => true,
        addInviteRecord() {},
        sendJoinTransaction: async () => {
          throw new Error('network');
        }
      }
    });

    await expect(manager.acceptGame('')).rejects.toThrow('Enter an invite link');
    await expect(manager.acceptGame('not an invite')).rejects.toThrow('That is not an Arcade invite link');
    manager.mod.app.modules.returnModule = (name) => {
      if (name === 'Arcade') {
        return { returnGameInvite: async () => ({ game_tx: tx, from_archive: true }), sendJoinTransaction() {} };
      }
      return name === 'Chess' ? manager.app.modules.mods[0] : null;
    };
    await expect(manager.acceptGame(INVITE)).rejects.toThrow('No open invitation');

    manager.app.modules.returnModule = app.modules.returnModule;
    app.modules.returnModule = (name) => {
      if (name === 'Arcade') {
        return {
          returnGameInvite: async () => ({ game_tx: tx, from_archive: false }),
          isAvailableGame: () => false,
          sendJoinTransaction() {}
        };
      }
      return name === 'Chess' ? app.modules.mods[0] : null;
    };
    await expect(manager.acceptGame(INVITE)).rejects.toThrow('not open');

    app.modules.returnModule = (name) => {
      if (name === 'Arcade') {
        return {
          returnGameInvite: async () => ({ game_tx: tx, from_archive: false }),
          isAvailableGame: () => true,
          addInviteRecord() {},
          sendJoinTransaction: async () => {
            throw new Error('network');
          }
        };
      }
      return name === 'Chess' ? app.modules.mods[0] : null;
    };
    await expect(manager.acceptGame(INVITE)).rejects.toThrow('network');
    expect(app.connection.listenerCount('arcade-game-ready-render-request')).toBe(0);
  });

  const SHORT = 'http://localhost:12101/arcade/s/ixb9965y';
  const LONG = 'http://localhost:12101/arcade/?game=chess&game_id=abcDEF1234567890&invite=1';

  function withFetch(response, run) {
    const previous = global.fetch;
    const requested = [];
    global.fetch = async (url) => {
      requested.push(String(url));
      return response;
    };
    return Promise.resolve()
      .then(() => run(requested))
      .finally(() => {
        global.fetch = previous;
      });
  }

  test('acceptGame follows an /arcade/s/{code} link to the long invite and joins it', async () => {
    const tx = inviteTx();
    const joined = [];
    const { app, manager } = harness({
      chess: gameModule('Chess', '', ''),
      arcade: {
        returnGameInvite: async (id, game) => {
          expect(id).toBe('abcDEF1234567890');
          expect(game).toBe('chess');
          return { game_tx: tx, from_archive: false };
        },
        isAvailableGame: () => true,
        addInviteRecord() {},
        sendJoinTransaction: async () => {
          joined.push(tx.signature);
          app.connection.emit('arcade-game-ready-render-request', { id: tx.signature });
        }
      }
    });

    await withFetch({ status: 200, url: LONG, text: async () => '' }, async (requested) => {
      await expect(manager.acceptGame(SHORT)).resolves.toBe('abcDEF1234567890');
      expect(requested).toEqual([SHORT]);
      expect(joined).toEqual(['abcDEF1234567890']);
    });
  });

  test('acceptGame seats an open table from a short invite link', async () => {
    const tx = inviteTx();
    tx.msg.request = 'active';
    tx.msg.options = { 'open-table': 1 };
    const seated = [];
    const { app, manager } = harness({
      chess: Object.assign(gameModule('Chess', '', ''), {
        requestSeatAtTable: async (game_tx) => {
          seated.push(game_tx.signature);
          app.connection.emit('arcade-game-ready-render-request', { id: game_tx.signature });
        }
      }),
      arcade: {
        returnGameInvite: async () => ({ game_tx: tx, from_archive: false }),
        sendJoinTransaction: async () => {
          throw new Error('direct join should not run');
        }
      }
    });

    await withFetch({ status: 200, url: LONG, text: async () => '' }, async () => {
      await expect(manager.acceptGame(SHORT)).resolves.toBe('abcDEF1234567890');
      expect(seated).toEqual(['abcDEF1234567890']);
    });
  });

  test('acceptGame reports a missing or expired short invite', async () => {
    const { manager } = harness({
      chess: gameModule('Chess', '', ''),
      arcade: {
        returnGameInvite: async () => {
          throw new Error('should not look up a game');
        },
        sendJoinTransaction() {}
      }
    });

    await withFetch({ status: 404, url: SHORT, text: async () => 'Shortlink expired' }, async () => {
      await expect(manager.acceptGame(SHORT)).rejects.toThrow('That invitation link has expired');
    });
    await withFetch(
      { status: 200, url: 'http://localhost:12101/arcade/', text: async () => '' },
      async () => {
        await expect(manager.acceptGame(SHORT)).rejects.toThrow('That invitation could not be found');
      }
    );
  });

  test('acceptGame reports when initialization does not finish', async () => {
    jest.useFakeTimers();
    const tx = inviteTx();
    const { manager } = harness({
      chess: gameModule('Chess', '', ''),
      arcade: {
        returnGameInvite: async () => ({ game_tx: tx, from_archive: false }),
        isAvailableGame: () => true,
        addInviteRecord() {},
        sendJoinTransaction: async () => {}
      }
    });
    try {
      const pending = manager.acceptGame(INVITE);
      for (let i = 0; i < 8; i++) {
        await Promise.resolve();
      }
      jest.advanceTimersByTime(30000);
      await expect(pending).rejects.toThrow('The game was not initialized');
    } finally {
      jest.useRealTimers();
    }
  });

  test('game scripts load jQuery before the game page scripts that depend on it', async () => {
    const page = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    const previous = global.document;
    global.document = page.window.document;
    try {
      const { mod } = harness();
      const screen = mod.game_screen;
      expect(screen.shared_scripts()[0]).toBe('/saito/lib/jquery/jquery-3.2.1.min.js');
      const added = await screen.load_scripts();
      const srcs = [...page.window.document.querySelectorAll('script')].map((el) => el.getAttribute('src'));
      expect(added[0]).toBe('/saito/lib/jquery/jquery-3.2.1.min.js');
      expect(srcs[0]).toBe('/saito/lib/jquery/jquery-3.2.1.min.js');
      expect(srcs[1]).toBe('/saito/lib/jquery/jquery-ui.min.js');
      expect(await screen.load_scripts()).toEqual([]);
    } finally {
      global.document = previous;
    }
  });

  test('game stylesheets follow the game page head for whichever module is open', () => {
    const chess = gameModule('Chess', 'game-a', '');
    chess.styles = ['/chess/chessboard.css', '/gamebot/style.css'];
    chess.returnSlug = () => 'chess';
    const go = gameModule('Go', 'game-b', '');
    go.slug = 'go';
    go.styles = ['/go/style.css'];
    const { mod } = harness({ chess, go });

    const chess_sheets = mod.game_screen.shared_stylesheets(chess);
    expect(chess_sheets).toEqual(expect.arrayContaining([
      '/saito/game.css',
      '/arcade/style.css',
      '/chess/style.css',
      '/chess/chessboard.css'
    ]));
    expect(chess_sheets.some((sheet) => sheet.includes('/gamebot/'))).toBe(false);

    const go_sheets = mod.game_screen.shared_stylesheets(go);
    expect(go_sheets).toContain('/go/style.css');
    expect(go_sheets).not.toContain('/chess/style.css');
    expect(go_sheets.filter((sheet) => sheet === '/go/style.css')).toHaveLength(1);
  });

  test('load_game_styles attaches that module stylesheet in the game document', async () => {
    const page = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    const previous = global.document;
    global.document = page.window.document;
    try {
      const go = gameModule('Go', 'game-b', '');
      go.styles = ['/go/extra.css'];
      const { mod } = harness({ go });
      const added = await mod.game_screen.load_styles(go);
      const hrefs = [...page.window.document.querySelectorAll('link')].map((el) => el.getAttribute('href'));
      expect(added).toContain('/go/style.css');
      expect(hrefs.some((href) => href.startsWith('/go/style.css'))).toBe(true);
      expect(hrefs.some((href) => href.startsWith('/saito/game.css'))).toBe(true);
      expect(page.window.document.documentElement.classList.contains('go')).toBe(true);
      expect(await mod.game_screen.load_styles(go)).toEqual([]);
    } finally {
      global.document = previous;
    }
  });

  test('openGame accepts a stored id and rejects an unknown id', async () => {
    const { app, manager } = harness();
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await expect(manager.openGame('game-a')).resolves.toBe('game-a');
    await expect(manager.openGame('missing')).rejects.toThrow('No local game');
  });

  test('opening a saved game starts the queue once and examines only after it is stable', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    chess.initialize_game_run = 0;
    chess.game.initialize_game_run = 1;
    const trace = [];
    chess.render = async () => {
      trace.push('render');
    };
    chess.initializeGame = async () => {
      trace.push('initializeGame');
    };
    chess.initializeGameQueue = async function (game_id) {
      trace.push(['queue', this.initialize_game_run, this.game.initialize_game_run, game_id]);
      if (this.game.initialize_game_run == 1 && this.initialize_game_run == 1) {
        trace.push('queue-skipped');
        return 0;
      }
      this.game.initialize_game_run = 1;
      this.initialize_game_run = 1;
      await this.initializeGame(game_id);
      await this.startQueue();
      return 1;
    };
    const { app, manager } = harness({ chess });
    chess.startQueue = async () => {
      trace.push('startQueue');
      app.connection.emit('game-queue-stable', { game_id: chess.game.id });
    };
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const examined = [];
    const examine = manager.examineGameState.bind(manager);
    manager.examineGameState = async (id) => {
      examined.push(id);
      return examine(id);
    };
    manager.listen();

    await manager.openGame('game-a');
    await new Promise((resolve) => setImmediate(resolve));

    expect(trace).toEqual([
      'render',
      ['queue', 0, 1, 'game-a'],
      'initializeGame',
      'startQueue'
    ]);
    expect(chess.initialize_game_run).toBe(1);
    expect(examined).toEqual(['game-a']);
    expect(manager.view.game_id).toBe('game-a');
    expect(manager.view.context.menu).toEqual([
      { id: 'e4', label: 'e4', identifier: 'button#e4' },
      { id: 'e5', label: 'e5', identifier: 'button#e5' }
    ]);

    await manager.openGame('game-a');
    await new Promise((resolve) => setImmediate(resolve));
    expect(trace).toContain('queue-skipped');
    expect(trace.filter((step) => step === 'startQueue')).toHaveLength(1);
    expect(examined).toEqual(['game-a']);

    await chess.startQueue();
    await new Promise((resolve) => setImmediate(resolve));
    expect(trace.filter((step) => step === 'initializeGame')).toHaveLength(1);
    expect(examined).toEqual(['game-a', 'game-a']);

    app.connection.emit('game-queue-stable', { game_id: 'game-b' });
    app.connection.emit('game-queue-stable', {});
    await new Promise((resolve) => setImmediate(resolve));
    expect(examined).toEqual(['game-a', 'game-a', 'game-b']);
    expect(manager.view.game_id).toBe('game-b');
    expect(manager.view.context).toBeNull();
  });

  test('Game.present restores a saved game through Manager.loadGame', async () => {
    const chess = gameModule('Chess', 'other', '<button id="e4">e4</button>');
    const module_loads = [];
    chess.loadGame = (id) => {
      module_loads.push(id);
      chess.game = { id, initializing: 0, seat: 1 };
      return chess.game;
    };
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const screen_loads = [];
    const load = manager.loadGame.bind(manager);
    manager.loadGame = async (id) => {
      screen_loads.push(id);
      return load(id);
    };

    await manager.mod.game_screen.present(chess, 'game-a', 'open');

    expect(screen_loads).toEqual(['game-a']);
    expect(module_loads).toEqual(['game-a']);
    expect(chess.game).toEqual({ id: 'game-a', initializing: 0, seat: 1 });
  });

  test('accepting a saved game loads it instead of creating another', async () => {
    const chess = gameModule('Chess', 'other', '');
    chess.doesGameExistLocally = async () => true;
    chess.newGame = () => {
      throw new Error('existing game was created');
    };
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await manager.mod.game_screen.present(chess, 'game-a', 'accept');

    expect(chess.game.id).toBe('game-a');
    expect(chess.game.initializing).toBe(0);
  });

  test('accepting a game that does not exist yet creates it', async () => {
    const chess = gameModule('Chess', '', '');
    chess.doesGameExistLocally = async () => false;
    chess.newGame = (id) => ({ id, initializing: 1, created: true });
    chess.loadGame = () => {
      throw new Error('new game was loaded');
    };
    const { manager } = harness({ chess });
    const loads = [];
    manager.loadGame = async (id) => {
      loads.push(id);
      return null;
    };

    await manager.mod.game_screen.present(chess, 'game-new', 'accept');

    expect(loads).toEqual([]);
    expect(chess.game).toEqual({ id: 'game-new', initializing: 1, created: true });
  });

  test('a board that appears during analysis is picked up by the next examination', async () => {
    const chess = gameModule('Chess', 'game-a', '<main id="board"></main>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async () => {
      asked.push('ai');
    };

    const prepared = await manager.examineGameState('game-a');
    expect(prepared.context.menu).toEqual([]);
    expect(prepared.context.instructions).toBe('The AI is halted until another move is received.');
    expect(asked).toEqual([]);

    chess.jsdom.window.document.getElementById('board').innerHTML = '<button id="skip">Skip fortification</button>';
    const view = await manager.examineGameState('game-a');
    expect(view.context.menu).toEqual([
      { id: 'skip', label: 'Skip fortification', identifier: 'button#skip' }
    ]);
  });

  test('loadGame waits for that game to load before examination reads it', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const chess = gameModule('Chess', '', '<button id="e4">e4</button>');
    chess.game = null;
    chess.loadGame = (id) => {
      return gate.then(() => {
        chess.game = { id, initializing: 0 };
        return chess.game;
      });
    };
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    let finished = false;
    const pending = manager.onGameQueueStable({ game_id: 'game-a' }).then((view) => {
      finished = true;
      return view;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(chess.game).toBeNull();

    release();
    await pending;
    const view = manager.view;
    expect(view.context.game.id).toBe('game-a');
    expect(view.context.game.module).toBe('Chess');
    expect(view.context.menu).toEqual([{ id: 'e4', label: 'e4', identifier: 'button#e4' }]);
    expect(view.context.game.js_dom).toBeUndefined();
    expect(chess.game.js_dom).toBeUndefined();
    expect(view.clickable_items.map((item) => item.text)).toEqual(['e4']);
    expect(view.clickable_items[0].identifier).toBe('button#e4');
  });

  test('examineGameState uses the requested game when another game is active', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const go = gameModule('Go', 'game-b', '<button id="pass">pass</button>');
    const { app, manager } = harness({ chess, go });
    app.options.games = [
      { id: 'game-a', module: 'Chess' },
      { id: 'game-b', module: 'Go' }
    ];
    manager.active_game_mod = chess;
    const module_loads = [];
    go.loadGame = (id) => {
      module_loads.push(id);
      go.game = { id, initializing: 0 };
      return go.game;
    };

    const game = await manager.loadGame('game-b');
    const view = await manager.examineGameState('game-b');

    expect(module_loads).toEqual([]);
    expect(game.id).toBe('game-b');
    expect(view.game_id).toBe('game-b');
    expect(view.context.game.module).toBe('Go');
    expect(view.clickable_items.map((item) => item.text)).toEqual(['pass']);
  });

  test('manual input is recorded and is not treated as a click', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager, clicks } = harness({ chess, track_clicks: true });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.examineGameState('game-a');

    const reply = await manager.handleManualInput('game-a', 'play e4');

    expect(reply.input).toBe('play e4');
    expect(reply.processed).toBe(false);
    expect(reply.response).toMatch(/not in the current list/);
    expect(clicks).toEqual(['play e4']);
  });

  test('executeAiAction clicks the selected control and ignores instructions', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', function () {
      hits.push(this.id);
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.examineGameState('game-a');

    await manager.handleResponse('game-a', 'button#e4');

    expect(hits).toEqual(['e4']);
    manager.games['game-a'].moves = [];
    manager.mod.jsdom.listed = [];
    await manager.handleResponse('game-a', '"button#e4"');
    manager.games['game-a'].moves = [];
    await manager.handleResponse('game-a', 'e4');
    expect(hits).toEqual(['e4', 'e4', 'e4']);
    manager.games['game-a'].moves = [];
    await expect(manager.handleManualInput('game-a', 'button#e4')).resolves.toMatchObject({
      processed: true
    });
    expect(hits).toEqual(['e4', 'e4', 'e4', 'e4']);
  });

  test('a choice copied from the menu clicks that control', async () => {
    const chess = gameModule('Chess', 'game-a', '<div id="place">Skip fortification</div>');
    const hits = [];
    chess.jsdom.window.document.getElementById('place').addEventListener('click', () => hits.push('place'));
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [{ id: 'place', label: 'Skip fortification', identifier: 'div#place' }]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.examineGameState('game-a');
    manager.mod.jsdom.listed = [];

    await manager.handleResponse('game-a', '"div#place"');
    manager.games['game-a'].moves = [];
    await manager.handleResponse('game-a', 'Skip fortification');

    expect(hits).toEqual(['place', 'place', 'place']);
    manager.mod.jsdom.listed = [];
    await expect(manager.handleResponse('game-a', 'not-listed')).rejects.toThrow(/not in the current list/);
    manager.games['game-a'].moves = [];
    await manager.handleResponse('game-a', { id: 'place' });
    manager.games['game-a'].moves = [];
    await manager.handleResponse('game-a', { label: 'Skip fortification' });
    expect(hits).toEqual(['place', 'place', 'place', 'place', 'place']);
  });

  test('an id or label that matches more than one menu option is not clicked', async () => {
    const chess = gameModule(
      'Chess',
      'game-a',
      '<button id="a">Yes</button><button id="b">Yes</button>'
    );
    const hits = [];
    const doc = chess.jsdom.window.document;
    doc.getElementById('a').addEventListener('click', () => hits.push('a'));
    doc.getElementById('b').addEventListener('click', () => hits.push('b'));
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [
        { id: 'same', label: 'Yes', identifier: 'button#a' },
        { id: 'same', label: 'Yes', identifier: 'button#b' }
      ]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.examineGameState('game-a');

    await expect(manager.handleResponse('game-a', { id: 'same' })).rejects.toThrow(
      /matches more than one menu option/
    );
    await expect(manager.handleResponse('game-a', { label: 'Yes' })).rejects.toThrow(
      /matches more than one menu option/
    );
    expect(hits).toEqual([]);
  });

  test('handleResponse clicks only a listed identifier for that game', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await expect(manager.handleResponse('game-a', { identifier: null })).resolves.toBeNull();
    await expect(manager.handleResponse('game-a', { identifier: '   ' })).resolves.toBeNull();
    await expect(
      manager.handleResponse('game-a', { game_id: 'game-b', identifier: 'button#e4' })
    ).resolves.toBeNull();
    await expect(manager.handleResponse('game-a', { identifier: 'button#missing' })).rejects.toThrow(
      /Move 1 \(button#missing\) failed/
    );
    expect(hits).toEqual([]);

    await expect(manager.handleResponse('game-a', { game_id: 'game-a', identifier: 'button#e4' })).resolves.toEqual([
      'button#e4'
    ]);
    expect(hits).toEqual(['e4']);
  });

  test('a response executes one string, one move, or several moves in order', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button><button id="third">Third</button>');
    const hits = [];
    const doc = chess.jsdom.window.document;
    doc.getElementById('first').addEventListener('click', () => hits.push('first'));
    doc.getElementById('second').addEventListener('click', () => hits.push('second'));
    doc.getElementById('third').addEventListener('click', () => hits.push('third'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await expect(manager.handleResponse('game-a', 'button#first')).resolves.toEqual(['button#first']);
    manager.games['game-a'].moves = [];
    await expect(
      manager.handleResponse('game-a', { moves: ['button#second'] })
    ).resolves.toEqual(['button#second']);
    manager.games['game-a'].moves = [];
    await expect(
      manager.handleResponse('game-a', {
        moves: ['button#first', 'button#second', 'button#third']
      })
    ).resolves.toEqual(['button#first', 'button#second', 'button#third']);
    manager.games['game-a'].moves = [];
    await expect(
      manager.handleResponse('game-a', '{"moves":["button#third","button#first"]}')
    ).resolves.toEqual(['button#third', 'button#first']);

    expect(hits).toEqual(['first', 'second', 'first', 'second', 'third', 'third', 'first']);
  });

  test('each move is resolved when it is executed, and a failure stops the sequence', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button>');
    const hits = [];
    const doc = chess.jsdom.window.document;
    doc.getElementById('first').addEventListener('click', () => {
      hits.push('first');
      if (doc.getElementById('second')) {
        return;
      }
      const next = doc.createElement('button');
      next.id = 'second';
      next.textContent = 'Second';
      next.addEventListener('click', () => hits.push('second'));
      doc.body.appendChild(next);
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await manager.handleResponse('game-a', { moves: ['button#first', 'button#second'] });
    expect(hits).toEqual(['first', 'second']);
    manager.games['game-a'].moves = [];

    await expect(
      manager.handleResponse('game-a', { moves: ['button#first', 'button#missing', 'button#second'] })
    ).rejects.toThrow(/Move 2 \(button#missing\) failed: That control is not in the current list/);
    expect(hits).toEqual(['first', 'second', 'first']);
  });

  test('invalid move responses are rejected before a click', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await expect(manager.handleResponse('game-a', { moves: [] })).rejects.toThrow(/moves array is empty/);
    await expect(manager.handleResponse('game-a', { moves: ['button#first', 2] })).rejects.toThrow(
      /Move 2 is not an action identifier/
    );
    await expect(manager.handleResponse('game-a', '{ "moves": [')).rejects.toThrow(/not valid JSON/);
    await expect(manager.handleResponse('game-a', { click: 'button#first' })).rejects.toThrow(
      /not a move or a moves object/
    );
    await expect(manager.handleResponse('game-a', ['button#first'])).rejects.toThrow(/not a move or a moves object/);
    await expect(manager.handleResponse('game-a', { moves: 'button#first' })).rejects.toThrow(
      /not a move or a moves object/
    );
    expect(hits).toEqual([]);
  });

  test('the context Click button submits through the same move execution', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button>');
    const hits = [];
    const doc = chess.jsdom.window.document;
    doc.getElementById('first').addEventListener('click', () => hits.push('first'));
    doc.getElementById('second').addEventListener('click', () => hits.push('second'));
    const { app, mod, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    const calls = [];
    const exams = [];
    const handle = manager.handleResponse.bind(manager);
    manager.handleResponse = async (id, response) => {
      calls.push([id, response]);
      return handle(id, response);
    };
    manager.examineGameState = async (id) => {
      exams.push(id);
    };
    const page = new JSDOM('<!DOCTYPE html><body></body></html>', { url: 'https://gamebot.invalid/gamebot/#gid=game-a' });
    const previous = { window: global.window, document: global.document };
    global.window = page.window;
    global.document = page.window.document;
    try {
      const Context = require('../../../mods/gamebot/lib/ui/context');
      new Context(app, mod).render();
      const form = document.querySelector('.gamebot-click');
      const field = form.querySelector('[name="identifier"]');
      field.value = 'button#first';
      await form.onsubmit({ preventDefault() {} });
      field.value = JSON.stringify({ moves: ['button#second', 'button#first'] });
      await form.onsubmit({ preventDefault() {} });
      expect(field.value).toBe('');
      expect(form.querySelector('.gamebot-click-result').textContent).toBe('last move: button#second, button#first');
      field.value = '{';
      await form.onsubmit({ preventDefault() {} });
      expect(field.value).toBe('{');
      expect(form.querySelector('.gamebot-click-result').textContent).toMatch(/not valid JSON/);
    } finally {
      global.window = previous.window;
      global.document = previous.document;
    }
    expect(hits).toEqual(['first', 'second', 'first']);
    expect(calls).toEqual([
      ['game-a', 'button#first'],
      ['game-a', JSON.stringify({ moves: ['button#second', 'button#first'] })],
      ['game-a', '{']
    ]);
    expect(exams).toEqual(['game-a', 'game-a']);
  });

  test('headless examination loads JSDOM and does not present the game', async () => {
    const chess = gameModule('Chess', 'other', '');
    const calls = [];
    chess.loadGameWithJSDOM = async (id) => {
      calls.push(id);
      chess.uses_jsdom = 1;
      chess.game = { id, initializing: 0 };
    };
    chess.render = async () => {
      calls.push('render');
    };
    const { app, manager } = harness({ chess });
    app.BROWSER = 0;
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await manager.loadGame('game-a');
    const view = await manager.examineGameState('game-a');

    expect(calls).toEqual(['game-a']);
    expect(chess.uses_jsdom).toBe(1);
    expect(chess.render).toBeDefined();
    expect(view.context.game.module).toBe('Chess');
    expect(view.context.instructions).toBe('The AI is halted until another move is received.');
  });

  test('game-queue-stable examines the event game and does not click without an identifier', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const go = gameModule('Go', 'game-b', '<button id="pass">pass</button><button id="resign">resign</button>');
    const hits = [];
    go.jsdom.window.document.getElementById('pass').addEventListener('click', () => hits.push('pass'));
    const { app, manager } = harness({ chess, go, track_clicks: true });
    app.options.games = [
      { id: 'game-a', module: 'Chess' },
      { id: 'game-b', module: 'Go' }
    ];
    manager.active_game_mod = chess;
    manager.listen();

    app.connection.emit('game-queue-stable', { game_id: 'game-b' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(manager.view.game_id).toBe('game-b');
    expect(manager.view.context.game.module).toBe('Go');
    expect(hits).toEqual([]);
    expect(manager.mod.jsdom.listed.find((item) => item.text === 'e4')).toBeUndefined();
  });
});

describe('GameBot examination loop', () => {
  test('onGameQueueStable starts the examination', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const started = [];
    const examine = manager.examineGameState.bind(manager);
    manager.examineGameState = (id) => {
      started.push(id);
      return examine(id);
    };
    manager.listen();

    manager.onGameQueueStable({ game_id: 'game-a' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(started).toEqual(['game-a']);
    expect(manager.view.context.menu).toEqual([
      { id: 'e4', label: 'e4', identifier: 'button#e4' },
      { id: 'e5', label: 'e5', identifier: 'button#e5' }
    ]);
  });

  test('a manual response does not examine between its moves', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="play">Play</button><button id="next">Next</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('play').addEventListener('click', () => hits.push('play'));
    chess.jsdom.window.document.getElementById('next').addEventListener('click', () => hits.push('next'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    const exams = [];
    manager.examineGameState = async (id) => {
      exams.push(id);
    };

    await manager.handleResponse('game-a', { moves: ['button#play', 'button#next'] });

    expect(hits).toEqual(['play', 'next']);
    expect(exams).toEqual(['game-a']);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['button#play', 'button#next']);
  });

  test('a fresh examination replaces a non-empty menu with the new HUD menu', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="old">Old</button>');
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [
        { id: 'old', label: 'Old', identifier: 'li#old' },
        { id: 'older', label: 'Older', identifier: 'li#older' }
      ]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await manager.examineGameState('game-a');
    expect(manager.view.context.menu).toEqual([
      { id: 'old', label: 'Old', identifier: 'li#old' },
      { id: 'older', label: 'Older', identifier: 'li#older' }
    ]);

    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [
        { id: 'new', label: 'New', identifier: 'li#new' },
        { id: 'newer', label: 'Newer', identifier: 'li#newer' }
      ]
    });
    const view = await manager.examineGameState('game-a');

    expect(view.context.menu).toEqual([
      { id: 'new', label: 'New', identifier: 'li#new' },
      { id: 'newer', label: 'Newer', identifier: 'li#newer' }
    ]);
    expect(manager.view.context).toBe(view.context);
  });

  test('reloading the manager starts from the saved game and drops the unfinished sequence', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, mod } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const first = new Manager(app, mod);
    mod.manager = first;
    first.games['game-a'] = {
      game_id: 'game-a',
      hash: 'old',
      moves: ['button#e4', 'button#e4'],
      created_at: 1,
      updated_at: 1
    };

    const reloaded = new Manager(app, mod);
    mod.manager = reloaded;
    const before = await reloaded.examineGameState('game-a');

    expect(hits).toEqual([]);
    expect(reloaded.games['game-a']).toBeUndefined();
    expect(before.context).toBeNull();

    const game = await reloaded.loadGame('game-a');
    const view = await reloaded.examineGameState('game-a');

    expect(hits).toEqual([]);
    expect(game.id).toBe('game-a');
    expect(view.context.game.id).toBe('game-a');
    expect(reloaded.games['game-a'].moves).toEqual([]);
    expect(chess.game.pending_execution).toBeUndefined();
  });
});

describe('GameBot game records', () => {
  test('a new game creates an entry with the record fields', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    chess.game.player = 1;
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await manager.loadGame('game-a');

    const entry = manager.games['game-a'];
    expect(Object.keys(entry).sort()).toEqual([
      'answered',
      'attempts',
      'created_at',
      'game_id',
      'hash',
      'last_queue_stable',
      'moves',
      'updated_at'
    ]);
    expect(entry.last_queue_stable).toBe(0);
    expect(entry.game_id).toBe('game-a');
    expect(entry.hash).toBe('hash:' + JSON.stringify(chess.game));
    expect(entry.moves).toEqual([]);
    expect(entry.created_at).toBe(entry.updated_at);
    expect(app.options.games[0]).toEqual({ id: 'game-a', module: 'Chess' });
  });

  test('loading the same hash preserves moves', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    const entry = manager.games['game-a'];
    entry.moves = ['button#e4'];
    const created_at = entry.created_at;
    const updated_at = entry.updated_at;

    const game = await manager.loadGame('game-a');

    expect(game).toBe(chess.game);
    expect(entry.moves).toEqual(['button#e4']);
    expect(entry.hash).toBe('hash:' + JSON.stringify(chess.game));
    expect(entry.created_at).toBe(created_at);
    expect(entry.updated_at).toBe(updated_at);
  });

  test('a live game change does not clear moves or the queue-stable timestamp', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    const entry = manager.games['game-a'];
    entry.last_queue_stable = 5;
    entry.moves = [{ move: 'button#e4', timestamp: 6 }];
    const created_at = entry.created_at;
    chess.game.player = 2;

    const game = await manager.loadGame('game-a');

    expect(game).toBe(chess.game);
    expect(game.player).toBe(2);
    expect(entry.moves).toEqual([{ move: 'button#e4', timestamp: 6 }]);
    expect(entry.last_queue_stable).toBe(5);
    expect(entry.hash).toBe('hash:' + JSON.stringify({ id: 'game-a', initializing: 0 }));
    expect(entry.created_at).toBe(created_at);
    expect(app.options.games[0].hash).toBeUndefined();
    expect(app.options.games[0].moves).toBeUndefined();
  });

  test('loading a game that is already active does not reload or replay it', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button>');
    const hits = [];
    const module_loads = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    chess.loadGame = (id) => {
      module_loads.push(id);
      chess.game = { id, initializing: 0 };
      return chess.game;
    };
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].moves = ['button#first'];

    const game = await manager.loadGame('game-a');

    expect(module_loads).toEqual([]);
    expect(hits).toEqual([]);
    expect(game.id).toBe('game-a');
    expect(manager.games['game-a'].moves).toEqual(['button#first']);
  });

  test('loading a different game restores it using JSON', async () => {
    const chess = gameModule('Chess', 'other', '<button id="e4">e4</button>');
    chess.loadGame = (id) => {
      chess.game = {
        id,
        initializing: 0,
        player: 1,
        jump() {
          return 1;
        }
      };
      return chess.game;
    };
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    const game = await manager.loadGame('game-a');

    expect(game).toEqual({ id: 'game-a', initializing: 0, player: 1 });
    expect(game.jump).toBeUndefined();
    expect(chess.game).toBe(game);
    expect(manager.games['game-a'].hash).toBe('hash:' + JSON.stringify(game));
  });

  test('an unchanged hash replays stored moves inside loadGame', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 1;
    manager.games['game-a'].moves = [{ move: 'button#first', timestamp: 2 }];
    chess.game = { id: 'other', initializing: 0 };
    let loading = false;
    const during = [];
    const execute = manager.executeMoves.bind(manager);
    manager.executeMoves = async (...args) => {
      during.push(loading);
      return execute(...args);
    };
    const load = manager.loadGame.bind(manager);
    manager.loadGame = async (id) => {
      loading = true;
      try {
        return await load(id);
      } finally {
        loading = false;
      }
    };

    const game = await manager.loadGame('game-a');

    expect(during).toEqual([true]);
    expect(hits).toEqual(['first']);
    expect(game.id).toBe('game-a');
    expect(game.initializing).toBe(0);
    expect(manager.games['game-a'].moves).toEqual([{ move: 'button#first', timestamp: 2 }]);
  });

  test('a changed saved game does not drop newer replay history', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 1;
    manager.games['game-a'].moves = [{ move: 'button#first', timestamp: 2 }];
    chess.loadGame = (id) => {
      chess.game = { id, initializing: 0, player: 3 };
      return chess.game;
    };
    chess.game = { id: 'other', initializing: 0 };

    const game = await manager.loadGame('game-a');

    expect(hits).toEqual(['first']);
    expect(game.player).toBe(3);
    expect(manager.games['game-a'].moves).toEqual([{ move: 'button#first', timestamp: 2 }]);
    expect(manager.games['game-a'].last_queue_stable).toBe(1);
  });

  test('onGameQueueStable does not replay stored moves', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].moves = [{ move: 'button#first', timestamp: 1 }];
    const phases = [];
    const execute = manager.executeMoves.bind(manager);
    manager.executeMoves = async (...args) => {
      phases.push('execute');
      return execute(...args);
    };

    await manager.onGameQueueStable({ game_id: 'game-a' });

    expect(hits).toEqual([]);
    expect(phases).toEqual([]);
    expect(manager.games['game-a'].moves).toEqual([]);
    expect(manager.view.game_id).toBe('game-a');
  });

  test('handleResponse does not replay stored moves', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    chess.jsdom.window.document.getElementById('second').addEventListener('click', () => hits.push('second'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 1;
    manager.games['game-a'].moves = [{ move: 'button#first', timestamp: 2 }];
    let loading = false;
    const callers = [];
    const load = manager.loadGame.bind(manager);
    manager.loadGame = async (id) => {
      loading = true;
      try {
        return await load(id);
      } finally {
        loading = false;
      }
    };
    const execute = manager.executeMoves.bind(manager);
    manager.executeMoves = async (...args) => {
      callers.push(loading ? 'load' : 'response');
      return execute(...args);
    };

    await manager.handleResponse('game-a', 'button#second');

    expect(callers).toEqual(['response']);
    expect(hits).toEqual(['second']);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['button#first', 'button#second']);
  });

  test('onGameQueueStable loads and reconciles before examination', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const order = [];
    const load = manager.loadGame.bind(manager);
    const examine = manager.examineGameState.bind(manager);
    manager.loadGame = async (...args) => {
      order.push('load');
      return load(...args);
    };
    manager.examineGameState = async (id) => {
      order.push('examine');
      expect(manager.games[id].hash).toBe('hash:' + JSON.stringify(chess.game));
      return examine(id);
    };

    await manager.onGameQueueStable({ game_id: 'game-a' });

    expect(order[0]).toBe('load');
    expect(order[1]).toBe('examine');
  });

  test('examineGameState hashes the active game without loading it', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const loads = [];
    chess.loadGame = (id) => {
      loads.push(id);
      chess.game = { id, initializing: 0 };
    };
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await manager.examineGameState('game-a');

    expect(loads).toEqual([]);
    expect(manager.games['game-a'].hash).toBe('hash:' + JSON.stringify(chess.game));
  });

  test('an automatic action examines again without asking the AI', async () => {
    const chess = gameModule(
      'Chess',
      'game-a',
      '<ul class="hud-menu"><li id="confirmit" class="option acknowledge">acknowledge</li></ul><button id="play">Play</button><button id="stay">Stay</button>'
    );
    const clicks = [];
    let acknowledged = false;
    chess.jsdom.window.document.getElementById('confirmit').onclick = function () {
      clicks.push(this.id);
      acknowledged = true;
      this.remove();
    };
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: acknowledged ? [] : [{ id: 'confirmit', label: 'acknowledge', identifier: 'li#confirmit' }]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const loads = [];
    const load = manager.loadGame.bind(manager);
    manager.loadGame = async (id) => {
      loads.push(id);
      return load(id);
    };
    let answers = 0;
    let exams = 0;
    const examine = manager.examineGameState.bind(manager);
    manager.examineGameState = async (id) => {
      exams += 1;
      if (exams === 1) {
        expect(answers).toBe(0);
      }
      return examine(id);
    };
    manager.mod.ai.requestResponse = async () => {
      answers += 1;
    };

    await manager.examineGameState('game-a');

    expect(clicks).toEqual(['confirmit']);
    expect(exams).toBe(2);
    expect(answers).toBe(1);
    expect(loads).toEqual([]);
  });

  test('an empty menu halts the AI until another move is received', async () => {
    const chess = gameModule('Chess', 'game-a', '<div id="board"></div>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async () => {
      asked.push('ai');
    };

    const view = await manager.examineGameState('game-a');

    expect(asked).toEqual([]);
    expect(view.context.menu).toEqual([]);
    expect(view.context.instructions).toBe('The AI is halted until another move is received.');
  });

  test('a menu from the game is kept and the board is not scanned', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [
        { id: 'hud', label: 'HUD', identifier: 'li#hud' },
        { id: 'pass', label: 'Pass', identifier: 'li#pass' }
      ]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async (context) => {
      asked.push(context.menu.map((item) => item.id));
    };

    const view = await manager.examineGameState('game-a');

    expect(view.context.menu).toEqual([
      { id: 'hud', label: 'HUD', identifier: 'li#hud' },
      { id: 'pass', label: 'Pass', identifier: 'li#pass' }
    ]);
    expect(asked).toEqual([['hud', 'pass']]);
  });

  test('no automatic action submits the final context to the AI', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const submitted = [];
    manager.mod.ai.requestResponse = async (context) => {
      submitted.push(context.menu.map((item) => item.id));
    };

    await manager.onGameQueueStable({ game_id: 'game-a' });

    expect(submitted).toEqual([['e4', 'e5']]);
  });

  test('context passes through the module, the game file, then generic processing', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const order = [];
    chess.returnContext = () => {
      order.push('module');
      return { game: { id: 'game-a', module: 'Chess', empty: 0 }, menu: [], note: 'module' };
    };
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    manager.gameHooks = () => ({
      returnContext(context) {
        order.push('game');
        context.note = 'game';
        return context;
      }
    });
    const read = manager.mod.jsdom.returnContext.bind(manager.mod.jsdom);
    manager.mod.jsdom.returnContext = (context) => {
      order.push('jsdom');
      return read(context);
    };

    const view = await manager.examineGameState('game-a');

    expect(order).toEqual(['module', 'game', 'jsdom']);
    expect(view.context.note).toBe('game');
    expect(view.context.instructions).toMatch(/Chess/);
    expect(view.context.game.empty).toBeUndefined();
    expect(view.context.menu).toEqual([
      { id: 'e4', label: 'e4', identifier: 'button#e4' },
      { id: 'e5', label: 'e5', identifier: 'button#e5' }
    ]);
  });

  test('the first automatic action stops the rest and examines again', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const calls = [];
    manager.actions.handleInformationalOverlay = async () => {
      calls.push('overlay');
      return calls.filter((name) => name === 'overlay').length === 1 ? ['button#e4'] : [];
    };
    manager.actions.handleSingleMenuOption = async () => {
      calls.push('single');
      return [];
    };
    manager.mod.ai.requestResponse = async () => {
      calls.push('ai');
    };

    await manager.examineGameState('game-a');

    expect(calls).toEqual(['overlay', 'overlay', 'single', 'ai']);
  });

  test('a game already in memory is not replayed, and new moves are appended', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    chess.jsdom.window.document.getElementById('second').addEventListener('click', () => hits.push('second'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 1;
    manager.games['game-a'].moves = [{ move: 'button#first', timestamp: 2 }];

    await manager.handleResponse('game-a', 'button#second');

    expect(hits).toEqual(['second']);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['button#first', 'button#second']);
    expect(app.options.games[0]).toEqual({ id: 'game-a', module: 'Chess' });
  });

  test('a disk reload replays stored moves and keeps that history', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    chess.jsdom.window.document.getElementById('second').addEventListener('click', () => hits.push('second'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 1;
    manager.games['game-a'].moves = [{ move: 'button#first', timestamp: 2 }];
    chess.game = { id: 'other', initializing: 0 };

    await manager.handleResponse('game-a', 'button#second');

    expect(hits).toEqual(['first', 'second']);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['button#first', 'button#second']);
    expect(chess.game.id).toBe('game-a');
  });

  test('a completed response examines directly and does not re-enter the queue', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const stable = [];
    const examine = manager.examineGameState.bind(manager);
    const queue = manager.onGameQueueStable.bind(manager);
    manager.onGameQueueStable = async (data) => {
      stable.push(data?.game_id);
      return queue(data);
    };
    const exams = [];
    manager.examineGameState = async (id) => {
      exams.push(id);
      return examine(id);
    };

    await manager.handleResponse('game-a', 'button#e4');

    expect(stable).toEqual([]);
    expect(exams).toEqual(['game-a']);
  });

  test('a game-specific handler succeeds only when it returns 1', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    manager.gameHooks = () => ({
      handleResponse() {
        return true;
      }
    });

    await manager.handleResponse('game-a', 'button#e4');

    expect(hits).toEqual(['e4']);
  });

  test('a game-specific handler that returns 1 is not also clicked', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const seen = [];
    manager.gameHooks = () => ({
      handleResponse(response) {
        seen.push(response);
        return 1;
      }
    });

    const result = await manager.handleResponse('game-a', 'button#e4');

    expect(result).toBe(1);
    expect(seen).toEqual(['button#e4']);
    expect(hits).toEqual([]);
    expect(manager.view.game_id).toBe('game-a');
  });

  test('a game-specific handler that returns nothing uses generic clicks', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    manager.gameHooks = () => ({
      handleResponse() {}
    });

    await manager.handleResponse('game-a', 'button#e4');

    expect(hits).toEqual(['e4']);
  });

  test('ordered moves run without an examination between them', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => hits.push('first'));
    chess.jsdom.window.document.getElementById('second').addEventListener('click', () => hits.push('second'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const during = [];
    const examine = manager.examineGameState.bind(manager);
    manager.examineGameState = async (id) => {
      during.push(hits.slice());
      return examine(id);
    };

    await manager.handleResponse('game-a', { moves: ['button#first', 'button#second'] });

    expect(hits).toEqual(['first', 'second']);
    expect(during[0]).toEqual(['first', 'second']);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['button#first', 'button#second']);
    expect(manager.games['game-a'].moves[0].timestamp).toBeLessThan(manager.games['game-a'].moves[1].timestamp);
    expect(manager.games['game-a'].last_queue_stable).toBe(0);
  });
});

describe('GameBot queue-stable timestamps', () => {
  test('onGameQueueStable records a timestamp before examination', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    let seen = 0;
    const examine = manager.examineGameState.bind(manager);
    manager.examineGameState = async (id) => {
      seen = manager.games[id].last_queue_stable;
      return examine(id);
    };

    await manager.onGameQueueStable({ game_id: 'game-a' });

    expect(seen).toBe(manager.games['game-a'].last_queue_stable);
    expect(seen).toBeGreaterThan(0);
  });

  test('two queue-stable events produce strictly increasing timestamps', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await manager.onGameQueueStable({ game_id: 'game-a' });
    const first = manager.games['game-a'].last_queue_stable;
    await manager.onGameQueueStable({ game_id: 'game-a' });
    const second = manager.games['game-a'].last_queue_stable;

    expect(second).toBeGreaterThan(first);
  });

  test('a new queue-stable event invalidates older replay history', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].moves = [
      { move: 'button#e4', timestamp: 1 },
      { move: 'button#e4', timestamp: manager.returnTimestamp() + 100000 }
    ];

    await manager.onGameQueueStable({ game_id: 'game-a' });

    const kept = manager.games['game-a'].moves;
    expect(kept).toHaveLength(1);
    expect(kept[0].move).toBe('button#e4');
    expect(kept[0].timestamp).toBeGreaterThan(manager.games['game-a'].last_queue_stable);
  });

  test('replay runs only moves newer than last_queue_stable and keeps that history', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="old">Old</button><button id="new">New</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('old').addEventListener('click', () => hits.push('old'));
    chess.jsdom.window.document.getElementById('new').addEventListener('click', () => hits.push('new'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    const history = [
      { move: 'button#old', timestamp: 1 },
      { move: 'button#new', timestamp: 3 }
    ];
    manager.games['game-a'].last_queue_stable = 2;
    manager.games['game-a'].moves = history.slice();
    chess.game = { id: 'other', initializing: 0 };

    const game = await manager.loadGame('game-a');

    expect(hits).toEqual(['new']);
    expect(manager.games['game-a'].moves).toEqual(history);
    expect(game.id).toBe('game-a');

    chess.game = { id: 'other', initializing: 0 };
    await manager.loadGame('game-a');
    expect(hits).toEqual(['new', 'new']);
    expect(manager.games['game-a'].moves).toEqual(history);
  });

  test('an ordered sequence stops when its queue-stable timestamp changes', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button><button id="second">Second</button>');
    const hits = [];
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => {
      hits.push('first');
      manager.games['game-a'].last_queue_stable = manager.returnTimestamp();
    });
    chess.jsdom.window.document.getElementById('second').addEventListener('click', () => hits.push('second'));
    await manager.loadGame('game-a');
    const generation = manager.games['game-a'].last_queue_stable;
    const exams = [];
    manager.examineGameState = async (id) => {
      exams.push(id);
    };

    const executed = await manager.handleResponse('game-a', {
      moves: ['button#first', 'button#second'],
      timestamp: generation
    });

    expect(hits).toEqual(['first']);
    expect(executed).toEqual([]);
    expect(exams).toEqual([]);
    expect(manager.games['game-a'].moves).toEqual([]);
    expect(manager.games['game-a'].last_queue_stable).not.toBe(generation);
  });

  test('an AI response is delivered only when its inquiry timestamp is current', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.onGameQueueStable({ game_id: 'game-a' });
    const stale = manager.games['game-a'].last_queue_stable;
    await manager.onGameQueueStable({ game_id: 'game-a' });
    const current = manager.games['game-a'].last_queue_stable;
    const delivered = [];
    const handle = manager.handleResponse.bind(manager);
    manager.handleResponse = async (id, response) => {
      delivered.push(response.timestamp);
      return handle(id, response);
    };

    await expect(
      manager.mod.ai.receiveResponse('game-a', { moves: ['button#e4'], timestamp: stale })
    ).resolves.toBeNull();
    expect(delivered).toEqual([]);
    expect(hits).toEqual([]);

    await expect(
      manager.mod.ai.receiveResponse('game-a', { moves: ['button#e4'], timestamp: current })
    ).resolves.toEqual(['button#e4']);
    expect(delivered).toEqual([current]);
    expect(hits).toEqual(['e4']);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['button#e4']);
    expect(manager.games['game-a'].last_queue_stable).toBe(current);
  });

  test('an AI response keeps its timestamp when loading yields', async () => {
    const chess = gameModule('Chess', 'other', '<button id="e4">e4</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    manager.returnGame('game-a').last_queue_stable = 1;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    chess.loadGame = (id) => {
      return gate.then(() => {
        chess.game = { id, initializing: 0 };
        return chess.game;
      });
    };

    const pending = manager.mod.ai.receiveResponse('game-a', {
      moves: ['button#e4'],
      timestamp: 1
    });
    await Promise.resolve();
    manager.games['game-a'].last_queue_stable = 2;
    release();

    await expect(pending).resolves.toBeNull();
    expect(hits).toEqual([]);
    expect(manager.games['game-a'].moves).toEqual([]);
  });

  test('a queue-stable event that is superseded during load does not examine', async () => {
    const chess = gameModule('Chess', 'other', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let loads = 0;
    chess.loadGame = (id) => {
      loads += 1;
      const finish = () => {
        chess.game = { id, initializing: 0 };
        return chess.game;
      };
      if (loads === 1) {
        return gate.then(finish);
      }
      return finish();
    };
    const examined = [];
    const examine = manager.examineGameState.bind(manager);
    manager.examineGameState = async (id, timestamp) => {
      examined.push(timestamp);
      return examine(id, timestamp);
    };

    const first = manager.onGameQueueStable({ game_id: 'game-a' });
    await Promise.resolve();
    const second = manager.onGameQueueStable({ game_id: 'game-a' });
    await second;
    const current = manager.games['game-a'].last_queue_stable;
    release();
    await first;

    expect(examined).toEqual([current]);
  });

  test('an obsolete examination does not submit an AI inquiry', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 11;
    let asked = 0;
    let actions = 0;
    manager.actions.handleInformationalOverlay = async () => {
      actions += 1;
      return [];
    };
    manager.mod.ai.requestResponse = async () => {
      asked += 1;
    };

    await manager.examineGameState('game-a', 3);

    expect(asked).toBe(0);
    expect(actions).toBe(0);
  });

  test('a recursive examination keeps the original queue-stable timestamp', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 9;
    const seen = [];
    const examine = manager.examineGameState.bind(manager);
    manager.examineGameState = async (id, timestamp) => {
      seen.push(timestamp);
      return examine(id, timestamp);
    };
    let calls = 0;
    manager.actions.handleInformationalOverlay = async () => {
      calls += 1;
      return calls === 1 ? ['button#e4'] : [];
    };
    manager.actions.handleSingleMenuOption = async () => [];

    await manager.examineGameState('game-a', 9);

    expect(seen).toEqual([9, 9]);
  });

  test('requestResponse displays the inquiry it receives', async () => {
    const { manager } = harness({ chess: gameModule('Chess', 'game-a', '<button id="e4">e4</button>') });
    const shown = [];
    manager.mod.game_screen.context.update = (context) => {
      shown.push(context);
    };
    const context = {
      menu: [{ id: 'e4', label: 'e4', identifier: 'button#e4' }],
      timestamp: 4
    };

    const returned = await manager.mod.ai.requestResponse(context);

    expect(returned).toBe(context);
    expect(manager.mod.ai.context).toBe(context);
    expect(shown).toEqual([context]);
    expect(shown[0].timestamp).toBe(4);
  });

  test('manual input does not need a queue-stable timestamp', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.onGameQueueStable({ game_id: 'game-a' });

    const reply = await manager.handleManualInput('game-a', 'button#e4');

    expect(reply.processed).toBe(true);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['button#e4']);
  });

  test('automatic actions and AI responses share recording and replay', async () => {
    const chess = gameModule(
      'Chess',
      'game-a',
      '<ul class="hud-menu"><li id="confirmit" class="option acknowledge">acknowledge</li></ul>'
    );
    const hits = [];
    chess.jsdom.window.document.getElementById('confirmit').onclick = () => hits.push('confirmit');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [{ id: 'confirmit', label: 'acknowledge', identifier: 'li#confirmit' }]
    });
    let submitted = null;
    manager.mod.ai.requestResponse = async (context) => {
      submitted = context.timestamp;
    };

    await manager.onGameQueueStable({ game_id: 'game-a' });

    expect(hits).toEqual(['confirmit']);
    expect(manager.games['game-a'].moves.map((item) => item.move)).toEqual(['li#confirmit']);
    expect(submitted).toBe(manager.games['game-a'].last_queue_stable);
    const stable = manager.games['game-a'].last_queue_stable;
    expect(manager.games['game-a'].moves[0].timestamp).toBeGreaterThan(stable);

    chess.game = { id: 'other', initializing: 0 };
    hits.length = 0;
    const before = manager.games['game-a'].moves.map((item) => ({ ...item }));
    await manager.loadGame('game-a');

    expect(hits).toEqual(['confirmit']);
    expect(manager.games['game-a'].moves).toEqual(before);
  });

  test('an examination does not ask the AI after its timestamp becomes obsolete', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="first">First</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 4;
    chess.jsdom.window.document.getElementById('first').addEventListener('click', () => {
      manager.games['game-a'].last_queue_stable = manager.returnTimestamp();
    });
    manager.actions.handleInformationalOverlay = async () => [];
    manager.actions.handleSingleMenuOption = async () => ['button#first'];
    let asked = 0;
    manager.mod.ai.requestResponse = async () => {
      asked += 1;
    };

    await manager.examineGameState('game-a');

    expect(asked).toBe(0);
    expect(manager.games['game-a'].moves).toEqual([]);
  });
});

describe('GameBot AI attempt limits', () => {
  function position() {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [
        { id: 'e4', label: 'e4', identifier: 'button#e4' },
        { id: 'e5', label: 'e5', identifier: 'button#e5' }
      ]
    });
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const shown = [];
    manager.mod.game_screen.context.update = (context) => {
      shown.push(context);
    };
    return { chess, manager, hits, shown };
  }

  async function ready(manager) {
    await manager.loadGame('game-a');
    manager.games['game-a'].last_queue_stable = 7;
  }

  test('a new inquiry increments the attempt counter', async () => {
    const { manager, shown } = position();
    await ready(manager);

    await manager.examineGameState('game-a', 7);

    expect(manager.games['game-a'].attempts).toBe(1);
    expect(shown).toHaveLength(1);
  });

  test('an identical pending context is not published twice', async () => {
    const { manager, shown } = position();
    await ready(manager);
    manager.view = { game_id: 'game-a' };
    const context = {
      menu: [
        { id: 'e4', label: 'e4', identifier: 'button#e4' },
        { id: 'e5', label: 'e5', identifier: 'button#e5' }
      ],
      game: { id: 'game-a', module: 'Chess' },
      instructions: 'Choose.',
      timestamp: 7
    };

    await manager.mod.ai.requestResponse(context);
    await manager.mod.ai.requestResponse(context);

    expect(shown).toHaveLength(1);
    expect(manager.mod.ai.slots['game-a'].pending).toBe(true);
    expect(manager.mod.ai.slots['game-a'].response).toBeNull();
  });

  test('an identical completed context returns its cached response', async () => {
    const { manager, shown, hits } = position();
    await ready(manager);
    const examine = manager.examineGameState.bind(manager);
    let opened = false;
    manager.examineGameState = async (id, timestamp) => {
      if (opened) {
        return manager.view;
      }
      opened = true;
      return examine(id, timestamp);
    };
    await manager.examineGameState('game-a', 7);
    const response = { moves: ['button#e4'], timestamp: 7 };

    await manager.mod.ai.receiveResponse('game-a', response);
    const again = await manager.mod.ai.requestResponse(manager.view.context);

    expect(again).toBe(response);
    expect(shown).toHaveLength(1);
    expect(hits).toEqual(['e4']);
  });

  test('a cached response is not executed twice', async () => {
    const { manager, hits } = position();
    await ready(manager);
    const examine = manager.examineGameState.bind(manager);
    let opened = false;
    manager.examineGameState = async (id, timestamp) => {
      if (opened) {
        return manager.view;
      }
      opened = true;
      return examine(id, timestamp);
    };
    await manager.examineGameState('game-a', 7);
    const response = { moves: ['button#e4'], timestamp: 7 };

    await manager.mod.ai.receiveResponse('game-a', response);
    await manager.mod.ai.requestResponse(manager.view.context);
    await manager.mod.ai.receiveResponse('game-a', response);

    expect(hits).toEqual(['e4']);
  });

  test('a changed instruction publishes a new inquiry', async () => {
    const { manager, shown } = position();
    await ready(manager);
    manager.view = { game_id: 'game-a' };
    const context = {
      menu: [{ id: 'e4', label: 'e4', identifier: 'button#e4' }],
      game: { id: 'game-a' },
      instructions: 'Choose.',
      timestamp: 7
    };

    await manager.mod.ai.requestResponse(context);
    await manager.mod.ai.requestResponse({ ...context, instructions: 'Choose a different action.' });

    expect(shown).toHaveLength(2);
    expect(shown[1].instructions).toBe('Choose a different action.');
  });

  test('a changed timestamp publishes a new inquiry', async () => {
    const { manager, shown } = position();
    await ready(manager);
    manager.view = { game_id: 'game-a' };
    const context = {
      menu: [{ id: 'e4', label: 'e4', identifier: 'button#e4' }],
      game: { id: 'game-a' },
      instructions: 'Choose.',
      timestamp: 7
    };

    await manager.mod.ai.requestResponse(context);
    await manager.mod.ai.requestResponse({ ...context, timestamp: 8 });

    expect(shown).toHaveLength(2);
    expect(shown[1].timestamp).toBe(8);
  });

  test('a changed context property publishes a new inquiry', async () => {
    const { manager, shown } = position();
    await ready(manager);
    manager.view = { game_id: 'game-a' };
    const context = {
      menu: [{ id: 'e4', label: 'e4', identifier: 'button#e4' }],
      game: { id: 'game-a' },
      instructions: 'Choose.',
      timestamp: 7
    };

    await manager.mod.ai.requestResponse(context);
    await manager.mod.ai.requestResponse({ ...context, note: 'later' });

    expect(shown).toHaveLength(2);
    expect(shown[1].note).toBe('later');
  });

  test('the sixth inquiry is not published', async () => {
    const { manager, shown } = position();
    await ready(manager);

    for (let i = 0; i < 5; i++) {
      await manager.examineGameState('game-a', 7);
      await manager.mod.ai.receiveResponse('game-a', { label: '', timestamp: 7 });
    }
    await manager.examineGameState('game-a', 7);

    expect(manager.games['game-a'].attempts).toBe(5);
    expect(shown).toHaveLength(5);
    expect(manager.view.context.instructions).toBe(
      'GameBot stopped after 5 AI attempts. The saved game has not changed.'
    );
  });

  test('a changed saved game resets the attempt counter', async () => {
    const { chess, manager, shown } = position();
    await ready(manager);
    await manager.examineGameState('game-a', 7);
    manager.games['game-a'].attempts = 4;
    manager.games['game-a'].answered = 'old-decision';
    chess.game.player = 2;

    await manager.examineGameState('game-a', 7);

    expect(manager.games['game-a'].attempts).toBe(0);
    expect(manager.games['game-a'].answered).toBe('');
    expect(manager.games['game-a'].hash).toBe('hash:' + JSON.stringify(chess.game));
    expect(shown).toHaveLength(1);
  });

  test('a new timestamp does not reset the attempt counter', async () => {
    const { manager, shown } = position();
    await ready(manager);
    await manager.examineGameState('game-a', 7);
    const hash = manager.games['game-a'].hash;
    manager.games['game-a'].attempts = 4;
    manager.games['game-a'].answered = 'kept';
    manager.games['game-a'].last_queue_stable = 8;

    await manager.examineGameState('game-a', 8);

    expect(manager.games['game-a'].attempts).toBe(5);
    expect(manager.games['game-a'].hash).toBe(hash);
    expect(shown[1].timestamp).toBe(8);
  });

  test('a stale response is not cached', async () => {
    const { manager, hits } = position();
    await ready(manager);
    await manager.examineGameState('game-a', 7);

    await expect(
      manager.mod.ai.receiveResponse('game-a', { moves: ['button#e4'], timestamp: 1 })
    ).resolves.toBeNull();

    expect(hits).toEqual([]);
    expect(manager.mod.ai.slots['game-a'].response).toBeNull();
    expect(manager.mod.ai.slots['game-a'].pending).toBe(true);
  });

  test('a failed or null response is not cached', async () => {
    const { manager } = position();
    await ready(manager);
    await manager.examineGameState('game-a', 7);

    await expect(
      manager.mod.ai.receiveResponse('game-a', { moves: [], timestamp: 7 })
    ).rejects.toThrow(/empty/);
    expect(manager.mod.ai.slots['game-a'].response).toBeNull();
    expect(manager.mod.ai.slots['game-a'].pending).toBe(false);
    expect(manager.games['game-a'].answered).toBe('');

    await manager.examineGameState('game-a', 7);
    await expect(manager.mod.ai.receiveResponse('game-a', null)).resolves.toBeNull();

    expect(manager.mod.ai.slots['game-a'].response).toBeNull();
    expect(manager.mod.ai.slots['game-a'].pending).toBe(false);
    expect(manager.games['game-a'].answered).toBe('');
  });
});

describe('GameBot JSDOM', () => {
  function domFor(html) {
    const page = new JSDOM(html);
    const mod = { manager: { active_game_mod: { jsdom: { window: page.window } } } };
    return { page, jsdom: new GameDom({}, mod) };
  }

  test('returnOptions describes the active game document', () => {
    const { jsdom } = domFor('<body><p>Move</p><button id="e4" class="square">e4</button></body>');
    const other = new JSDOM('<button id="resign">resign</button>');
    jsdom.mod.manager.active_game_mod.other = other;

    const items = jsdom.returnOptions();

    expect(items).toEqual([
      expect.objectContaining({
        identifier: 'button#e4',
        text: 'e4',
        tag: 'button',
        classes: ['square'],
        context: expect.stringContaining('Move')
      })
    ]);
    expect(items.some((item) => item.text === 'resign')).toBe(false);
  });

  test('executeClick runs the listed element and refuses a changed or replaced control', async () => {
    const { page, jsdom } = domFor('<body><button id="e4">e4</button><button id="e5">e5</button></body>');
    const doc = page.window.document;
    const hits = [];
    doc.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    doc.getElementById('e5').addEventListener('click', () => hits.push('e5'));
    const listed = jsdom.returnOptions().find((item) => item.text === 'e4');

    await jsdom.executeClick(listed.identifier);
    expect(hits).toEqual(['e4']);
    jsdom.returnOptions();
    await jsdom.executeClick('"button#e4"');
    expect(hits).toEqual(['e4', 'e4']);

    jsdom.returnOptions();
    doc.getElementById('e4').textContent = 'resign';
    doc.getElementById('e5').textContent = 'e4';
    await expect(jsdom.executeClick(listed.identifier)).rejects.toThrow(/changed/);
    expect(hits).toEqual(['e4', 'e4']);

    const rebuilt = domFor('<body><button id="e4">e4</button></body>');
    const first = rebuilt.jsdom.returnOptions()[0];
    const replacement = rebuilt.page.window.document.createElement('button');
    replacement.id = 'e4';
    replacement.textContent = 'resign';
    replacement.addEventListener('click', () => hits.push('resign'));
    rebuilt.page.window.document.body.replaceChildren(replacement);
    await expect(rebuilt.jsdom.executeClick(first.identifier)).rejects.toThrow(/changed/);
    expect(hits).not.toContain('resign');
  });
});

describe('GameBot UI', () => {
  let previous;

  beforeEach(() => {
    const page = new JSDOM('<!DOCTYPE html><body></body></html>', { url: 'https://gamebot.invalid/gamebot/' });
    previous = { window: global.window, document: global.document };
    global.window = page.window;
    global.document = page.window.document;
  });

  afterEach(() => {
    global.window = previous.window;
    global.document = previous.document;
  });

  function mount() {
    const calls = { accept: [], open: [], manual: [], click: [], examined: [] };
    const app = {
      browser: {
        addElementToDom(html) {
          document.body.insertAdjacentHTML('beforeend', html);
        }
      }
    };
    const mod = { browser_active: true, render() {} };
    mod.manager = {
      phase: 'splash',
      notice: '',
      acceptGame: async (link) => {
        calls.accept.push(link);
        return 'game-1';
      },
      openGame: async (id) => {
        calls.open.push(id);
        if (id === 'missing') {
          throw new Error('No local game has that id');
        }
        return id;
      },
      examineGameState: async (id) => {
        calls.examined.push(id);
        mod.manager.view = {
          game_id: id,
          slug: 'chess',
          context: {
            game: {
              id,
              target: 2,
              js_dom: { clickable_items: [{ identifier: 'button#e4', text: 'e4', tag: 'button' }] }
            }
          },
          context_error: '',
          clickable_items: [{ identifier: 'button#e4', text: 'e4', tag: 'button' }]
        };
        mod.manager.on_context?.(id);
        return mod.manager.view;
      },
      handleManualInput: async (id, input) => {
        calls.manual.push([id, input]);
        mod.manager.manual = {
          game_id: id,
          input,
          processed: false,
          response: 'No AI is configured to interpret this instruction'
        };
        mod.manager.on_context?.(id);
        return mod.manager.manual;
      },
      executeAiAction: async (id, identifier) => {
        calls.click.push([id, identifier]);
      },
      handleResponse: async (id, identifier) => {
        calls.click.push([id, identifier]);
      }
    };
    return { app, mod, calls };
  }

  test('the landing page submits an invite and a game id', async () => {
    const { app, mod, calls } = mount();
    new Main(app, mod).render();

    const landing = document.querySelector('#saito-container.gamebot-page .saito-main');
    expect(landing.querySelector('h1').textContent).toBe('AI GameBot Development');
    expect(landing.querySelector('.saito-button-primary').textContent).toBe('Accept Invite');

    const accept = document.querySelector('.gamebot-accept');
    accept.querySelector('[name="invite_link"]').value = INVITE;
    await accept.onsubmit({ preventDefault() {} });

    expect(calls.accept).toEqual([INVITE]);
    expect(mod.manager.phase).toBe('game');
    expect(window.location.hash).toBe('#gid=game-1');
    expect(document.querySelector('.gamebot-accept')).toBeNull();

    mod.manager.phase = 'splash';
    window.location.hash = '';
    new Main(app, mod).render();
    const open = document.querySelector('.gamebot-open');
    open.querySelector('[name="game_id"]').value = 'game-a';
    await open.onsubmit({ preventDefault() {} });
    expect(calls.open).toEqual(['game-a']);
    expect(window.location.hash).toBe('#gid=game-a');

    open.querySelector('[name="game_id"]').value = 'missing';
    await open.onsubmit({ preventDefault() {} });
    expect(document.querySelector('.gamebot-notice').textContent).toMatch(/No local game/);
  });

  test('the game page shows context, sends manual text separately, and clicks a listed item separately', async () => {
    const { app, mod, calls } = mount();
    window.location.hash = 'gid=game-1';
    await new Game(app, mod).render();
    expect(calls.examined).toEqual([]);
    await mod.manager.examineGameState('game-1');

    expect(document.querySelector('#gamebot-inspector h2')).toBeNull();
    const copy = document.querySelector('.gamebot-inspector-copy');
    expect(copy.getAttribute('aria-label')).toBe('Copy');
    expect(copy.querySelector('.gamebot-copy-icon')).toBeTruthy();
    const copied = [];
    global.navigator = {
      clipboard: {
        writeText: async (text) => {
          copied.push(text);
        }
      }
    };
    await copy.onclick();
    expect(copy.classList.contains('gamebot-copied')).toBe(true);
    expect(copy.getAttribute('aria-label')).toBe('Copied');
    expect(copied[0]).toBe(JSON.stringify(mod.manager.view.context, null, 2));
    expect(copied[0]).toContain('"target"');
    expect(copied[0]).toContain('button#e4');
    const branch = document.querySelector('.gamebot-tree .jsontree_node_complex:not(.jsontree_node_expanded)');
    expect(branch).toBeTruthy();
    branch.querySelector('.jsontree_label').click();
    expect(branch.classList.contains('jsontree_node_expanded')).toBe(true);
    branch.querySelector('.jsontree_label').click();
    expect(branch.classList.contains('jsontree_node_expanded')).toBe(false);

    expect(document.querySelector('.gamebot-tree').textContent).toContain('target');
    expect(document.querySelector('.gamebot-tree').textContent).toContain('2');
    expect(document.querySelector('.gamebot-tree').textContent).toContain('button#e4');

    expect(document.querySelector('.gamebot-manual')).toBeNull();
    expect(document.querySelector('[name="instruction"]')).toBeNull();
    const click = document.querySelector('.gamebot-click');
    expect(click.querySelector('label').textContent).toBe('Your choice');
    expect(click.querySelector('[name="identifier"]').getAttribute('placeholder')).toBe('Enter the item identifier');
    expect(click.querySelector('button').classList.contains('saito-button-primary')).toBe(true);
    expect(click.querySelector('button').textContent).toBe('Click');
    click.querySelector('[name="identifier"]').value = 'button#e4';
    await click.onsubmit({ preventDefault() {} });
    expect(calls.click).toEqual([['game-1', 'button#e4']]);
    expect(calls.manual).toEqual([]);
  });

  test('the inspector stays above a rendered board and its toggle remains clickable', async () => {
    const { app, mod } = mount();
    window.location.hash = 'gid=game-1';
    document.body.innerHTML = '<div id="main" class="gameboard" style="position:absolute;inset:0;z-index:900000"></div>';

    await new Game(app, mod).render();

    const host = document.getElementById('gamebot-inspector-root');
    const board = document.querySelector('.gameboard');
    const tab = document.querySelector('.gamebot-inspector-tab');
    const panel = document.getElementById('gamebot-inspector');
    expect(host.parentElement).toBe(document.documentElement);
    expect(board.contains(host)).toBe(false);
    expect(Number(host.style.zIndex)).toBeGreaterThan(Number(board.style.zIndex));
    expect(host.style.pointerEvents).toBe('none');
    expect(tab.getAttribute('aria-expanded')).toBe('false');

    tab.click();
    expect(document.getElementById('gamebot-inspector-root').classList.contains('gamebot-inspector-open')).toBe(true);
    expect(tab.getAttribute('aria-expanded')).toBe('true');
    expect(panel.getAttribute('aria-hidden')).toBe('false');

    tab.click();
    expect(document.getElementById('gamebot-inspector-root').classList.contains('gamebot-inspector-open')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(board.isConnected).toBe(true);
  });

  test('the drawer and JSON tree stay readable over a rendered board', async () => {
    const { app, mod } = mount();
    const long = 'country-identifier-'.repeat(12) + 'end';
    const many = {};
    for (let i = 0; i < 40; i += 1) {
      many['property_' + i] = i;
    }
    mod.manager.view = {
      game_id: 'game-1',
      slug: 'twilight',
      context: {
        game: {
          id: 'game-1',
          note: long,
          countries: [{ name: 'Asia', owner: long }],
          nested: { level: { items: [{ label: long, count: 3 }] } },
          many
        }
      },
      context_error: ''
    };
    window.location.hash = 'gid=game-1';
    document.body.innerHTML = '<div class="gameboard" style="position:absolute;inset:0;z-index:900000"></div>';
    const inspector_css = fs.readFileSync(
      path.join(__dirname, '../../../mods/gamebot/web/css/gamebot-context.css'),
      'utf8'
    );
    const style = document.createElement('style');
    style.textContent = inspector_css;
    document.head.appendChild(style);
    for (const item of style.sheet.cssRules) {
      if (!item.selectorText) {
        continue;
      }
      for (const selector of item.selectorText.split(',')) {
        expect(selector).toMatch(/#gamebot-inspector-root/);
      }
    }

    const page = new Game(app, mod);
    await page.render();

    const panel = document.getElementById('gamebot-inspector');
    const tab = document.querySelector('.gamebot-inspector-tab');
    const copy = document.querySelector('.gamebot-inspector-copy');
    const tree = document.querySelector('.gamebot-tree');
    const declared = {};
    for (const sheet of document.styleSheets) {
      for (const item of sheet.cssRules) {
        if (item.selectorText) {
          declared[item.selectorText] = item.style;
        }
      }
    }
    const drawer = declared['#gamebot-inspector-root'].getPropertyValue('--gamebot-drawer-width');
    expect(drawer).toContain('50vw');
    expect(drawer).toContain('70vw');
    expect(declared['#gamebot-inspector-root .gamebot-inspector'].width).toBe('var(--gamebot-drawer-width)');
    expect(declared['#gamebot-inspector-root .gamebot-inspector'].getPropertyValue('max-width')).toBe('70vw');
    expect(declared['#gamebot-inspector-root .gamebot-inspector'].getPropertyValue('height')).toBe('100vh');
    expect(declared['#gamebot-inspector-root.gamebot-inspector-open .gamebot-inspector-tab'].left).toBe('var(--gamebot-drawer-width)');
    const panelStyle = window.getComputedStyle(panel);
    const tabStyle = window.getComputedStyle(tab);
    expect(panelStyle.position).toBe('fixed');
    expect(panelStyle.pointerEvents).toBe('none');
    expect(tab.classList.contains('gamebot-needs-move')).toBe(false);
    expect(tabStyle.backgroundColor).toBe('rgb(26, 26, 26)');
    expect(tabStyle.color).toBe('rgb(255, 216, 74)');
    mod.manager.view.context.menu = [{ id: 'play', label: 'Play', identifier: 'button#play' }];
    page.context.update();
    expect(tab.classList.contains('gamebot-needs-move')).toBe(true);
    expect(window.getComputedStyle(tab).backgroundColor).toBe('rgb(255, 216, 74)');
    expect(window.getComputedStyle(tab).color).toBe('rgb(26, 26, 26)');
    mod.manager.view.context.menu = [];
    page.context.update();
    expect(tab.classList.contains('gamebot-needs-move')).toBe(false);
    expect(tabStyle.pointerEvents).toBe('auto');
    expect(tabStyle.minHeight).not.toBe('0px');
    expect(window.getComputedStyle(copy).backgroundColor).toBe('rgb(244, 239, 228)');
    expect(window.getComputedStyle(tree).overflow).toBe('auto');

    const label = document.querySelector('.jsontree_label-wrapper');
    const node = document.querySelector('.jsontree_node');
    expect(window.getComputedStyle(label).position).toBe('static');
    expect(window.getComputedStyle(label).float).toBe('none');
    expect(window.getComputedStyle(node).justifyContent).toBe('flex-start');
    expect(parseFloat(window.getComputedStyle(node).width)).toBeLessThan(window.innerWidth);
    expect(tree.textContent).toContain(long);
    expect(tree.textContent).toContain('property_39');

    const branch = document.querySelector('.jsontree_node_complex:not(.jsontree_node_expanded)');
    branch.querySelector('.jsontree_label').click();
    expect(branch.classList.contains('jsontree_node_expanded')).toBe(true);
    expect(window.getComputedStyle(branch.querySelector('.jsontree_child-nodes')).display).toBe('block');

    tab.click();
    expect(document.getElementById('gamebot-inspector-root').classList.contains('gamebot-inspector-open')).toBe(true);
    expect(
      declared['#gamebot-inspector-root.gamebot-inspector-open .gamebot-inspector'].getPropertyValue('pointer-events')
    ).toBe('auto');
    tab.click();
    expect(document.getElementById('gamebot-inspector-root').classList.contains('gamebot-inspector-open')).toBe(false);
    expect(document.querySelector('.gameboard').isConnected).toBe(true);
  });
});

describe('available actions', () => {
  function contextFor(hud, game) {
    const source = {
      id: 'game-1',
      status: 'Your move',
      vp_needed: 20,
      confirms_needed: 1,
      accept: true,
      hand: [],
      note: null,
      blank: '',
      queue: ['s_roll\t1', 's_pick_card', 'PLAY'],
      ...game
    };
    return GameTemplate.prototype.returnContext.call({
      game: source,
      hud
    });
  }

  test('a HUD menu is the only menu, and the game snapshot is pruned without changing the game', () => {
    const game = {
      id: 'game-1',
      status: 'Your move',
      vp_needed: 20,
      confirms_needed: 1,
      accept: true,
      hand: [],
      note: null,
      blank: '',
      queue: ['s_roll\t1', 's_pick_card', 'PLAY']
    };
    const hud = {
      returnContext() {
        return {
          menu: [
            { id: 'play', label: 'Play', identifier: 'li#play' },
            { id: 'play', label: 'Play again', identifier: 'li#play' }
          ],
          cards: [{ id: 'asia', label: 'Asia', identifier: 'div#asia' }]
        };
      }
    };
    const context = GameTemplate.prototype.returnContext.call({ game, hud });
    expect(context.menu).toEqual(hud.returnContext().menu);
    expect(context.menu.some((entry) => entry.id === 'asia')).toBe(false);
    expect(context.hud).toBeUndefined();
    expect(context.game.status).toBe('Your move');
    expect(context.game.vp_needed).toBe(20);
    expect(context.game.hand).toEqual([]);
    expect(context.game.confirms_needed).toBeUndefined();
    expect(context.game.accept).toBeUndefined();
    expect(context.game.note).toBeUndefined();
    expect(context.game.blank).toBeUndefined();
    expect(context.game.queue).toEqual(['PLAY']);
    expect(game.queue).toEqual(['s_roll\t1', 's_pick_card', 'PLAY']);
    expect(game.accept).toBe(true);
  });

  test('context drops empty arrays and top-level zeros, and names the game', async () => {
    const source = {
      id: 'game-a',
      sroll: 0,
      sroll_done: 0,
      spick_done: 0,
      note: null,
      blank: '',
      hand: [],
      moves: ['place', []],
      countries: { poland: { us: 0, ussr: 3, events: [] } },
      status: 'Place influence'
    };
    const chess = gameModule('Chess', 'game-a', '<button id="play">Play</button>');
    chess.game = source;
    chess.returnTitle = () => 'Twilight Struggle';
    chess.returnContext = () => ({ game: source, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    const view = await manager.examineGameState('game-a');
    const keys = Object.keys(view.context);

    expect(keys[0]).toBe('instructions');
    expect(keys.indexOf('game')).toBeGreaterThan(keys.indexOf('instructions'));
    expect(keys.indexOf('menu')).toBeGreaterThan(keys.indexOf('game'));
    expect(view.context.instructions).toBe(
      'You are playing Twilight Struggle. Pick a move from the menu array and respond with the id, identifier, or label of your preferred choice.'
    );
    expect(view.context.game.sroll).toBeUndefined();
    expect(view.context.game.sroll_done).toBeUndefined();
    expect(view.context.game.spick_done).toBeUndefined();
    expect(view.context.game.note).toBeUndefined();
    expect(view.context.game.blank).toBeUndefined();
    expect(view.context.game.hand).toBeUndefined();
    expect(view.context.game.moves).toEqual(['place']);
    expect(view.context.game.countries.poland).toEqual({ us: 0, ussr: 3 });
    expect(view.context.game.status).toBe('Place influence');
    expect(view.context.menu).toEqual([{ id: 'play', label: 'Play', identifier: 'button#play' }]);
    expect(source.hand).toEqual([]);
    expect(source.sroll).toBe(0);
    expect(source.moves).toEqual(['place', []]);
    expect(source.countries.poland.us).toBe(0);
  });

  test('actionable HUD cards are the menu only when the HUD menu is empty', () => {
    const cards = [{ id: 'asia', label: 'Asia', identifier: 'div#asia' }];
    const context = contextFor({
      returnContext() {
        return { menu: [], cards };
      }
    });
    expect(context.menu).toEqual(cards);
  });

  test('HUD cards are included only when a callback is attached, and a later read sees the change', () => {
    const dom = new JSDOM('<div class="hud-cards"></div>');
    const previous_document = global.document;
    const previous_window = global.window;
    global.document = dom.window.document;
    global.window = dom.window;
    try {
      const host = document.querySelector('.hud-cards');
      host.innerHTML = '<ul class="hud-menu"><li id="play" class="option">Play</li><li id="play" class="option">Play copy</li></ul><div id="asia" class="card">Asia</div><div id="europe" class="card">Europe</div><div id="africa" class="card noclick">Africa</div>';
      const asia = document.getElementById('asia');
      const europe = document.getElementById('europe');
      const africa = document.getElementById('africa');
      document.querySelectorAll('.hud-menu .option').forEach((item) => {
        item.onclick = () => {};
      });
      asia.onclick = () => {};
      europe.onmouseup = () => {};
      africa.onmouseup = () => {};
      const hud = new GameHUD2({}, {
        cardbox: {
          callback: () => {},
          card_types: [{ css: 'card', action: 'select', mycallback: null }]
        }
      });
      let reported = hud.returnContext();
      expect(reported.menu.map((entry) => entry.id)).toEqual(['play']);
      expect(reported.cards.map((card) => card.id)).toEqual(['asia', 'europe']);
      expect(reported.cards.find((card) => card.id === 'europe').identifier).toBe('div#europe');

      hud.mod.cardbox.callback = null;
      asia.onclick = null;
      reported = hud.returnContext();
      expect(reported.cards).toEqual([]);
    } finally {
      global.document = previous_document;
      global.window = previous_window;
    }
  });

  test('board actions exclude incidental controls and duplicate identifiers', async () => {
    const html = [
      '<div id="saito-header"><button id="wallet">Game</button></div>',
      '<div class="game-menu"><button id="chat">Chat</button><button id="difficulty">Difficulty</button></div>',
      '<div class="board"><button id="e4">e4</button><button id="e4">e4 copy</button><button id="info">Info</button></div>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const view = await manager.examineGameState('game-a');
    expect(view.context.menu).toEqual([{ id: 'e4', label: 'e4', identifier: 'button#e4' }]);
  });

  test('log, zoom, and close controls are omitted while a country click remains', async () => {
    const html = [
      '<div id="log-wrapper"><div id="mobile-log-tab" class="mobile-log-tab"></div><div id="log" class="log">log text</div></div>',
      '<div id="game_board_sizer" class="game_board_sizer">',
      '<button type="button" class="game-board-sizer-center" aria-label="Center board"></button>',
      '<button type="button" class="game-board-sizer-step" data-board-zoom="1" aria-label="Magnify board">+</button>',
      '<button type="button" class="game-board-sizer-step" data-board-zoom="-1" aria-label="Shrink board">-</button>',
      '</div>',
      '<div class="game-minimap"><button type="button" class="game-minimap-close" aria-label="Hide minimap">×</button></div>',
      '<div id="cardbox-exit" class="cardbox-exit">×</div>',
      '<div class="saito-cta-loader-shell"><div class="saito-cta-loader-card"><a href="" data-saito-loader-retry hidden>Retry</a></div></div>',
      '<div id="game-help" class="game-help"><div class="game-help-text"><div class="line1">where to place?</div></div></div>',
      '<div id="game-hud2" class="game-hud2"><div class="hud-notice"></div><div class="hud-cards"><div id="poland" class="card">Poland</div></div></div>',
      '<div id="eastgermany" class="country easterneurope">East Germany</div>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    const doc = chess.jsdom.window.document;
    doc.getElementById('log').onmouseup = () => {};
    doc.getElementById('mobile-log-tab').onclick = () => {};
    doc.querySelector('[data-saito-loader-retry]').onclick = () => {};
    doc.getElementById('game-help').onclick = () => {};
    doc.querySelector('.hud-notice').onclick = () => {};
    doc.getElementById('poland').onclick = () => {};
    doc.getElementById('eastgermany').onclick = () => {};
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const view = await manager.examineGameState('game-a');
    expect(view.context.menu).toEqual([
      { id: 'poland', label: 'Poland', identifier: 'div#poland' },
      { id: 'eastgermany', label: 'East Germany', identifier: 'div#eastgermany' }
    ]);
  });

  test('preview-only cards are omitted and a jQuery country click remains', async () => {
    const html = [
      '<div class="hud-cards">',
      '<div id="asia" class="card">Asia</div>',
      '<div id="europe" class="card">Europe</div>',
      '</div>',
      '<div id="eastgermany" class="country easterneurope">East Germany</div>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', '');
    const page = new JSDOM('<!DOCTYPE html><html><head></head><body>' + html + '</body></html>', {
      runScripts: 'dangerously',
      url: 'https://gamebot.invalid/'
    });
    page.window.eval(fs.readFileSync(path.join(__dirname, '../../../web/saito/lib/jquery/jquery-3.2.1.min.js'), 'utf8'));
    chess.jsdom = { window: page.window };
    const doc = page.window.document;
    const placed = [];
    page.window.jQuery('#eastgermany').on('click', function () {
      placed.push(this.id);
    });
    doc.getElementById('asia').onmouseup = () => {};
    doc.getElementById('europe').onmouseup = () => {};
    chess.cardbox = {
      callback: null,
      card_types: [
        { css: 'card', action: 'select', mycallback: null },
        { css: 'showcard', action: '', mycallback: null }
      ]
    };
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    let view = await manager.examineGameState('game-a');
    expect(view.context.menu).toEqual([
      { id: 'eastgermany', label: 'East Germany', identifier: 'div#eastgermany' }
    ]);

    chess.cardbox.callback = () => {};
    view = await manager.examineGameState('game-a');
    expect(view.context.menu.map((entry) => entry.id)).toEqual(['asia', 'europe', 'eastgermany']);

    await manager.handleResponse('game-a', 'div#eastgermany');
    expect(placed).toEqual(['eastgermany', 'eastgermany']);
  });

  test('the game board is omitted and clicks inside it remain', async () => {
    const html = [
      '<div id="gameboard" class="gameboard">',
      '<div id="eastgermany" class="country">East Germany</div>',
      '<button id="board-button">Board</button>',
      '</div>',
      '<div class="game-board"><button id="inside-alt">Inside</button></div>',
      '<button id="play">Play</button>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    const doc = chess.jsdom.window.document;
    doc.getElementById('gameboard').onclick = () => {};
    doc.getElementById('eastgermany').onclick = () => {};
    doc.getElementById('eastgermany').onmouseup = () => {};
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const view = await manager.examineGameState('game-a');
    expect(view.context.menu).toEqual([
      { id: 'eastgermany', label: 'East Germany', identifier: 'div#eastgermany' },
      { id: 'board-button', label: 'Board', identifier: 'button#board-button' },
      { id: 'inside-alt', label: 'Inside', identifier: 'button#inside-alt' },
      { id: 'play', label: 'Play', identifier: 'button#play' }
    ]);
  });

  test('a selected card is executed through its mouseup callback', async () => {
    const chess = gameModule('Chess', 'game-a', '<div id="asia" class="card">Asia</div>');
    const hits = [];
    chess.jsdom.window.document.getElementById('asia').onmouseup = function () {
      hits.push(this.id);
    };
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const view = await manager.examineGameState('game-a');
    expect(view.context.menu).toEqual([{ id: 'asia', label: 'Asia', identifier: 'div#asia' }]);
    await manager.handleResponse('game-a', 'div#asia');
    expect(hits).toEqual(['asia', 'asia']);
  });

  function useGameContext(chess) {
    chess.cardbox = new GameCardbox({}, chess);
    chess.cardbox.cardbox_lock = 1;
    chess.hud = new GameHUD2({}, chess);
    chess.returnContext = function () {
      return GameTemplate.prototype.returnContext.call(this);
    };
  }

  function cardboxModule(menu, boxStyle = 'display:block') {
    const html = [
      '<button id="play">Play</button>',
      '<div id="asia" class="card">Asia</div>',
      '<div id="game-cardbox" class="game-cardbox" style="' + boxStyle + '">',
      '<div id="cardbox-card" style="display:block">card</div>',
      menu,
      '</div>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    chess.jsdom.window.document.getElementById('asia').onclick = () => {};
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    return chess;
  }

  test('no visible card-box menu leaves normal game actions in place', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="play">Play</button><div id="asia" class="card">Asia</div>');
    chess.jsdom.window.document.getElementById('asia').onclick = () => {};
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    const view = await manager.examineGameState('game-a');

    expect(view.context.menu).toEqual([
      { id: 'play', label: 'Play', identifier: 'button#play' },
      { id: 'asia', label: 'Asia', identifier: 'div#asia' }
    ]);
  });

  test('a Game HUD card-box menu is preserved and JSDOM does not replace it', async () => {
    const chess = cardboxModule(
      '<div id="cardbox-menu" class="cardbox-menu" style="display:block"><button id="headline">Headline</button><button id="submit">Submit</button></div>'
    );
    const doc = chess.jsdom.window.document;
    const cards = doc.createElement('div');
    cards.className = 'hud-cards';
    cards.appendChild(doc.getElementById('asia'));
    doc.body.appendChild(cards);
    const previous_document = global.document;
    const previous_window = global.window;
    global.document = doc;
    global.window = chess.jsdom.window;
    doc.getElementById('headline').onclick = () => {};
    doc.getElementById('submit').onclick = () => {};
    useGameContext(chess);
    try {
      const { app, manager } = harness({ chess });
      app.options.games = [{ id: 'game-a', module: 'Chess' }];

      const view = await manager.examineGameState('game-a');

      expect(view.context.menu).toEqual([
        { id: 'headline', label: 'Headline', identifier: 'button#headline' },
        { id: 'submit', label: 'Submit', identifier: 'button#submit' }
      ]);
    } finally {
      global.document = previous_document;
      global.window = previous_window;
    }
  });

  test('JSDOM fills an empty or missing menu and leaves a menu that already has options', () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button><button id="e5">e5</button>');
    const { mod } = harness({ chess });
    const filled = mod.jsdom.returnContext({ menu: [] });
    const missing = mod.jsdom.returnContext({});
    const invalid = mod.jsdom.returnContext({ menu: 'play' });
    const kept = mod.jsdom.returnContext({
      menu: [{ id: 'hud', label: 'HUD', identifier: 'li#hud' }]
    });
    const board = [
      { id: 'e4', label: 'e4', identifier: 'button#e4' },
      { id: 'e5', label: 'e5', identifier: 'button#e5' }
    ];

    expect(filled.menu).toEqual(board);
    expect(missing.menu).toEqual(board);
    expect(invalid.menu).toEqual(board);
    expect(kept.menu).toEqual([{ id: 'hud', label: 'HUD', identifier: 'li#hud' }]);
  });

  test('one card-box option is clicked without asking the AI', async () => {
    const chess = cardboxModule('<div id="cardbox-menu" class="cardbox-menu" style="display:block">Submit</div>');
    const doc = chess.jsdom.window.document;
    const clicks = [];
    const asked = [];
    doc.getElementById('cardbox-menu').onclick = function () {
      clicks.push(this.id);
      this.style.display = 'none';
    };
    const previous_document = global.document;
    const previous_window = global.window;
    global.document = doc;
    global.window = chess.jsdom.window;
    useGameContext(chess);
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    manager.mod.ai.requestResponse = async (context) => {
      asked.push(context?.menu);
    };

    let view;
    try {
      view = await manager.examineGameState('game-a');
    } finally {
      global.document = previous_document;
      global.window = previous_window;
    }

    expect(clicks).toEqual(['cardbox-menu']);
    expect(asked).toEqual([[
      { id: 'play', label: 'Play', identifier: 'button#play' },
      { id: 'asia', label: 'Asia', identifier: 'div#asia' }
    ]]);
    expect(view.context.menu.map((entry) => entry.id)).toEqual(['play', 'asia']);
  });

  test('a hidden card-box menu does not replace game actions', async () => {
    const hiddenMenu = cardboxModule('<div id="cardbox-menu" class="cardbox-menu" style="display:none"><button id="submit">Submit</button></div>');
    const hiddenBox = cardboxModule(
      '<div id="cardbox-menu" class="cardbox-menu" style="display:block"><button id="submit">Submit</button></div>',
      'display:none'
    );
    const { app, manager } = harness({ chess: hiddenMenu });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    let view = await manager.examineGameState('game-a');
    expect(view.context.menu.map((entry) => entry.id)).toEqual(['play', 'asia']);

    manager.active_game_mod = hiddenBox;
    app.modules.mods = [hiddenBox];
    app.modules.returnModule = (name) => (name === 'Chess' ? hiddenBox : null);
    view = await manager.examineGameState('game-a');
    expect(view.context.menu.map((entry) => entry.id)).toEqual(['play', 'asia']);
  });

  test('text inside a card-box menu is not an action unless it is a control', async () => {
    const chess = cardboxModule('<div id="cardbox-menu" class="cardbox-menu" style="display:block">select<span>choose</span></div>');
    const clicks = [];
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    manager.mod.ai.requestResponse = async () => {
      clicks.push('ai');
      return { configured: false, identifier: null };
    };

    const view = await manager.examineGameState('game-a');

    expect(view.context.menu).toEqual([
      { id: 'play', label: 'Play', identifier: 'button#play' },
      { id: 'asia', label: 'Asia', identifier: 'div#asia' }
    ]);
    expect(clicks).toEqual(['ai']);
  });

  test('a single card-box option is not clicked again on the next observation', async () => {
    const chess = cardboxModule('<div id="cardbox-menu" class="cardbox-menu" style="display:block">Submit</div>');
    const clicks = [];
    const doc = chess.jsdom.window.document;
    doc.getElementById('cardbox-menu').onclick = function () {
      clicks.push(this.id);
    };
    const previous_document = global.document;
    const previous_window = global.window;
    global.document = doc;
    global.window = chess.jsdom.window;
    useGameContext(chess);
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async (context) => {
      asked.push(context?.menu);
    };

    try {
      await manager.examineGameState('game-a');
      await manager.examineGameState('game-a');
    } finally {
      global.document = previous_document;
      global.window = previous_window;
    }

    expect(clicks).toEqual(['cardbox-menu']);
    expect(asked).toEqual([
      [{ id: 'cardbox-menu', label: 'Submit', identifier: 'div#cardbox-menu' }],
      [{ id: 'cardbox-menu', label: 'Submit', identifier: 'div#cardbox-menu' }]
    ]);
  });

  test('a visible headline overlay keeps the close box and closes it', async () => {
    const html = [
      '<div id="saito-overlay1" class="saito-overlay center-overlay" style="display:block">',
      '<div id="saito-overlay-closebox1" class="saito-overlay-closebox"><i class="fas fa-times-circle"></i></div>',
      '<div class="saito-overlay-panel">Soviet / American Headlines * higher value card triggered first, US breaks ties</div>',
      '</div>',
      '<div id="saito-overlay-backdrop1" class="saito-overlay-backdrop" style="display:block"></div>',
      '<button id="play">Play</button>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    const doc = chess.jsdom.window.document;
    const clicks = [];
    doc.getElementById('saito-overlay1').onclick = () => {};
    doc.getElementById('saito-overlay-backdrop1').onclick = () => {};
    doc.getElementById('saito-overlay-closebox1').onclick = function () {
      clicks.push(this.id);
      doc.getElementById('saito-overlay1').style.display = 'none';
      doc.getElementById('saito-overlay-backdrop1').style.display = 'none';
    };
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async (context) => {
      asked.push(context?.menu?.map((entry) => entry.id));
    };

    await manager.examineGameState('game-a');

    expect(clicks).toEqual(['saito-overlay-closebox1']);
    expect(asked).toEqual([['play']]);
  });

  test('a close-only overlay is closed and an acknowledge button is clicked', async () => {
    const html = [
      '<div id="saito-overlay1" class="saito-overlay" style="display:block">',
      '<div id="saito-overlay-closebox1" class="saito-overlay-closebox">close</div>',
      '<div class="scoring-overlay">US wins</div>',
      '</div>',
      '<ul class="hud-menu"><li id="confirmit" class="option acknowledge">acknowledge</li></ul>',
      '<button id="play">Play</button>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    const doc = chess.jsdom.window.document;
    const clicks = [];
    let acknowledged = false;
    doc.getElementById('saito-overlay-closebox1').onclick = function () {
      clicks.push(this.id);
      doc.getElementById('saito-overlay1').style.display = 'none';
    };
    doc.getElementById('confirmit').onclick = function () {
      clicks.push(this.id);
      acknowledged = true;
      this.remove();
    };
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: acknowledged ? [] : [{ id: 'confirmit', label: 'acknowledge', identifier: 'li#confirmit' }]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async (context) => {
      asked.push(context?.menu?.map((entry) => entry.id));
    };

    await manager.examineGameState('game-a');

    expect(clicks).toEqual(['confirmit', 'saito-overlay-closebox1']);
    expect(asked).toEqual([['play']]);
  });

  test('an overlay with another control is left for the player', async () => {
    const html = [
      '<div id="saito-overlay1" class="saito-overlay" style="display:block">',
      '<div id="saito-overlay-closebox1" class="saito-overlay-closebox">close</div>',
      '<button id="choose">Choose</button>',
      '</div>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    const clicks = [];
    chess.jsdom.window.document.getElementById('saito-overlay-closebox1').onclick = function () {
      clicks.push(this.id);
    };
    chess.jsdom.window.document.getElementById('choose').onclick = () => {};
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async () => {
      asked.push('ai');
      return { configured: false, identifier: null };
    };

    await manager.examineGameState('game-a');

    expect(clicks).toEqual([]);
    expect(asked).toEqual(['ai']);
  });

  test('a hidden overlay is not closed', async () => {
    const html = [
      '<div id="saito-overlay1" class="saito-overlay" style="display:none">',
      '<div id="saito-overlay-closebox1" class="saito-overlay-closebox">close</div>',
      '</div>',
      '<button id="play">Play</button>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    const clicks = [];
    chess.jsdom.window.document.getElementById('saito-overlay-closebox1').onclick = function () {
      clicks.push(this.id);
    };
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    const view = await manager.examineGameState('game-a');

    expect(clicks).toEqual([]);
    expect(view.context.menu.map((entry) => entry.id)).toEqual(['play']);
  });

  test('the same close box is not clicked again on the next observation', async () => {
    const html = [
      '<div id="saito-overlay1" class="saito-overlay" style="display:block">',
      '<div id="saito-overlay-closebox1" class="saito-overlay-closebox">close</div>',
      '</div>'
    ].join('');
    const chess = gameModule('Chess', 'game-a', html);
    const clicks = [];
    chess.jsdom.window.document.getElementById('saito-overlay-closebox1').onclick = function () {
      clicks.push(this.id);
    };
    chess.returnContext = () => ({ game: { id: 'game-a', module: 'Chess' }, menu: [] });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async () => {
      asked.push('ai');
      return { configured: false, identifier: null };
    };

    await manager.examineGameState('game-a');
    await manager.examineGameState('game-a');

    expect(clicks).toEqual(['saito-overlay-closebox1']);
    expect(asked).toEqual(['ai', 'ai']);
  });

  test('a single board country is clicked', async () => {
    const chess = gameModule('Chess', 'game-a', '<div id="yugoslavia" class="country">1 1</div>');
    const clicks = [];
    chess.jsdom.window.document.getElementById('yugoslavia').onclick = function () {
      clicks.push(this.id);
    };
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [{ id: 'yugoslavia', label: '1 1', identifier: 'div#yugoslavia' }]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async (context) => {
      asked.push(context?.menu?.map((entry) => entry.id));
    };

    await manager.examineGameState('game-a');

    expect(clicks).toEqual(['yugoslavia']);
    expect(asked).toEqual([['yugoslavia']]);
  });

  test('several acknowledge options stay in the menu', async () => {
    const html = '<ul class="hud-menu"><li id="0" class="option acknowledge">Yes</li><li id="1" class="option acknowledge">No</li></ul>';
    const chess = gameModule('Chess', 'game-a', html);
    const clicks = [];
    chess.jsdom.window.document.getElementById('0').onclick = function () {
      clicks.push(this.id);
    };
    chess.jsdom.window.document.getElementById('1').onclick = function () {
      clicks.push(this.id);
    };
    chess.returnContext = () => ({
      game: { id: 'game-a', module: 'Chess' },
      menu: [
        { id: '0', label: 'Yes', identifier: 'li#0' },
        { id: '1', label: 'No', identifier: 'li#1' }
      ]
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    const asked = [];
    manager.mod.ai.requestResponse = async () => {
      asked.push('ai');
      return { configured: false, identifier: null };
    };

    await manager.examineGameState('game-a');

    expect(clicks).toEqual([]);
    expect(asked).toEqual(['ai']);
  });
});
