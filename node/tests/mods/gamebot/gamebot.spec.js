const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const Manager = require('../../../mods/gamebot/lib/manager');
const GameTemplate = require('../../../lib/templates/gametemplate');
const GameHUD2 = require('../../../lib/saito/ui/game-hud2/game-hud2');
const AI = require('../../../mods/gamebot/lib/ai');
const GameDom = require('../../../mods/gamebot/lib/jsdom');
const Main = require('../../../mods/gamebot/lib/ui/main');
const GamePage = require('../../../mods/gamebot/lib/ui/game');

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
  mod.jsdom.execute_click = extra.track_clicks
    ? async (identifier) => {
        clicks.push(identifier);
        return GameDom.prototype.execute_click.call(mod.jsdom, identifier);
      }
    : mod.jsdom.execute_click.bind(mod.jsdom);
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
  test('accept_game joins a valid invitation and hears a ready event emitted during the join', async () => {
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
      manager.accept_game(INVITE),
      new Promise((_, reject) => setTimeout(() => reject(new Error('missed ready event')), 500))
    ]);

    expect(game_id).toBe('abcDEF1234567890');
    expect(joined).toEqual(['abcDEF1234567890']);
    expect(tx.msg.options.desired_opponent_publickey).toBe('player-key');
    expect(app.connection.listenerCount('arcade-game-ready-render-request')).toBe(0);
  });

  test('accept_game rejects an unusable link, a closed invitation, and a failed join', async () => {
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

    await expect(manager.accept_game('')).rejects.toThrow('Enter an invite link');
    await expect(manager.accept_game('not an invite')).rejects.toThrow('That is not an Arcade invite link');
    manager.mod.app.modules.returnModule = (name) => {
      if (name === 'Arcade') {
        return { returnGameInvite: async () => ({ game_tx: tx, from_archive: true }), sendJoinTransaction() {} };
      }
      return name === 'Chess' ? manager.app.modules.mods[0] : null;
    };
    await expect(manager.accept_game(INVITE)).rejects.toThrow('No open invitation');

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
    await expect(manager.accept_game(INVITE)).rejects.toThrow('not open');

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
    await expect(manager.accept_game(INVITE)).rejects.toThrow('network');
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

  test('accept_game follows an /arcade/s/{code} link to the long invite and joins it', async () => {
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
      await expect(manager.accept_game(SHORT)).resolves.toBe('abcDEF1234567890');
      expect(requested).toEqual([SHORT]);
      expect(joined).toEqual(['abcDEF1234567890']);
    });
  });

  test('accept_game seats an open table from a short invite link', async () => {
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
      await expect(manager.accept_game(SHORT)).resolves.toBe('abcDEF1234567890');
      expect(seated).toEqual(['abcDEF1234567890']);
    });
  });

  test('accept_game reports a missing or expired short invite', async () => {
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
      await expect(manager.accept_game(SHORT)).rejects.toThrow('That invitation link has expired');
    });
    await withFetch(
      { status: 200, url: 'http://localhost:12101/arcade/', text: async () => '' },
      async () => {
        await expect(manager.accept_game(SHORT)).rejects.toThrow('That invitation could not be found');
      }
    );
  });

  test('accept_game reports when initialization does not finish', async () => {
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
      const pending = manager.accept_game(INVITE);
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
      const { manager } = harness();
      expect(manager.game_scripts()[0]).toBe('/saito/lib/jquery/jquery-3.2.1.min.js');
      const added = await manager.load_game_scripts();
      const srcs = [...page.window.document.querySelectorAll('script')].map((el) => el.getAttribute('src'));
      expect(added[0]).toBe('/saito/lib/jquery/jquery-3.2.1.min.js');
      expect(srcs[0]).toBe('/saito/lib/jquery/jquery-3.2.1.min.js');
      expect(srcs[1]).toBe('/saito/lib/jquery/jquery-ui.min.js');
      expect(await manager.load_game_scripts()).toEqual([]);
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
    const { manager } = harness({ chess, go });

    const chess_sheets = manager.game_stylesheets(chess);
    expect(chess_sheets).toEqual(expect.arrayContaining([
      '/saito/game.css',
      '/arcade/style.css',
      '/chess/style.css',
      '/chess/chessboard.css'
    ]));
    expect(chess_sheets.some((sheet) => sheet.includes('/gamebot/'))).toBe(false);

    const go_sheets = manager.game_stylesheets(go);
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
      const { manager } = harness({ go });
      const added = await manager.load_game_styles(go);
      const hrefs = [...page.window.document.querySelectorAll('link')].map((el) => el.getAttribute('href'));
      expect(added).toContain('/go/style.css');
      expect(hrefs.some((href) => href.startsWith('/go/style.css'))).toBe(true);
      expect(hrefs.some((href) => href.startsWith('/saito/game.css'))).toBe(true);
      expect(page.window.document.documentElement.classList.contains('go')).toBe(true);
      expect(await manager.load_game_styles(go)).toEqual([]);
    } finally {
      global.document = previous;
    }
  });

  test('open_game accepts a stored id and rejects an unknown id', async () => {
    const { app, manager } = harness();
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await expect(manager.open_game('game-a')).resolves.toBe('game-a');
    await expect(manager.open_game('missing')).rejects.toThrow('No local game');
  });

  test('opening a saved game starts the queue once and examines only after it is stable', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button>');
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
    const examine = manager.examine_game_move.bind(manager);
    manager.examine_game_move = async (id) => {
      examined.push(id);
      return examine(id);
    };
    manager.listen();

    await manager.open_game('game-a');
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
    expect(manager.view.context.menu).toEqual([{ id: 'e4', label: 'e4', identifier: 'button#e4' }]);

    await manager.open_game('game-a');
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

  test('a repeated stable event does not examine the same game twice until that examination finishes', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button>');
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const examined = [];
    const examine = manager.examine_game_move.bind(manager);
    manager.examine_game_move = async (id) => {
      examined.push(id);
      await gate;
      return examine(id);
    };
    manager.listen();

    app.connection.emit('game-queue-stable', { game_id: 'game-a' });
    app.connection.emit('game-queue-stable', { game_id: 'game-a' });
    expect(examined).toEqual(['game-a']);

    release();
    await new Promise((resolve) => setImmediate(resolve));
    app.connection.emit('game-queue-stable', { game_id: 'game-a' });
    expect(examined).toEqual(['game-a', 'game-a']);
  });

  test('examine_game_move waits for that game to load and reads its context and controls', async () => {
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
    const pending = manager.examine_game_move('game-a').then((view) => {
      finished = true;
      return view;
    });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(chess.game).toBeNull();

    release();
    const view = await pending;
    expect(view.context.game.id).toBe('game-a');
    expect(view.context.game.module).toBe('Chess');
    expect(view.context.menu).toEqual([{ id: 'e4', label: 'e4', identifier: 'button#e4' }]);
    expect(view.context.game.js_dom).toBeUndefined();
    expect(chess.game.js_dom).toBeUndefined();
    expect(view.clickable_items.map((item) => item.text)).toEqual(['e4']);
    expect(view.clickable_items[0].identifier).toBe('button#e4');
  });

  test('examine_game_move uses the requested game when another game is active', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button>');
    const go = gameModule('Go', 'game-b', '<button id="pass">pass</button>');
    const { app, manager } = harness({ chess, go });
    app.options.games = [
      { id: 'game-a', module: 'Chess' },
      { id: 'game-b', module: 'Go' }
    ];
    manager.active_game_mod = chess;

    const view = await manager.examine_game_move('game-b');

    expect(view.game_id).toBe('game-b');
    expect(view.context.game.module).toBe('Go');
    expect(view.clickable_items.map((item) => item.text)).toEqual(['pass']);
  });

  test('manual input is recorded and is not treated as a click', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button>');
    const { app, manager, clicks } = harness({ chess, track_clicks: true });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.examine_game_move('game-a');

    const reply = await manager.receive_manual_input('game-a', 'play e4');

    expect(reply.input).toBe('play e4');
    expect(reply.processed).toBe(false);
    expect(reply.response).toMatch(/No AI is configured/);
    expect(clicks).toEqual([]);
  });

  test('execute_clickable_item clicks the selected control and ignores instructions', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', function () {
      hits.push(this.id);
    });
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await manager.examine_game_move('game-a');

    await manager.execute_clickable_item('game-a', 'button#e4');

    expect(hits).toEqual(['e4']);
    await expect(manager.receive_manual_input('game-a', 'button#e4')).resolves.toMatchObject({
      processed: false
    });
    expect(hits).toEqual(['e4']);
  });

  test('receive_ai_analysis clicks only a listed identifier for that game', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button>');
    const hits = [];
    chess.jsdom.window.document.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    const { app, manager } = harness({ chess });
    app.options.games = [{ id: 'game-a', module: 'Chess' }];

    await expect(manager.receive_ai_analysis('game-a', { identifier: null })).resolves.toBeNull();
    await expect(manager.receive_ai_analysis('game-a', { identifier: '   ' })).resolves.toBeNull();
    await expect(
      manager.receive_ai_analysis('game-a', { game_id: 'game-b', identifier: 'button#e4' })
    ).resolves.toBeNull();
    await expect(manager.receive_ai_analysis('game-a', { identifier: 'button#missing' })).resolves.toBeNull();
    expect(hits).toEqual([]);

    await expect(manager.receive_ai_analysis('game-a', { game_id: 'game-a', identifier: 'button#e4' })).resolves.toBe(
      'button#e4'
    );
    expect(hits).toEqual(['e4']);
  });

  test('game-queue-stable examines the event game and does not click without an identifier', async () => {
    const chess = gameModule('Chess', 'game-a', '<button id="e4">e4</button>');
    const go = gameModule('Go', 'game-b', '<button id="pass">pass</button>');
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

describe('GameBot JSDOM', () => {
  function domFor(html) {
    const page = new JSDOM(html);
    const mod = { manager: { active_game_mod: { jsdom: { window: page.window } } } };
    return { page, jsdom: new GameDom({}, mod) };
  }

  test('get_clickable_items describes the active game document', () => {
    const { jsdom } = domFor('<body><p>Move</p><button id="e4" class="square">e4</button></body>');
    const other = new JSDOM('<button id="resign">resign</button>');
    jsdom.mod.manager.active_game_mod.other = other;

    const items = jsdom.get_clickable_items();

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

  test('execute_click runs the listed element and refuses a changed or replaced control', async () => {
    const { page, jsdom } = domFor('<body><button id="e4">e4</button><button id="e5">e5</button></body>');
    const doc = page.window.document;
    const hits = [];
    doc.getElementById('e4').addEventListener('click', () => hits.push('e4'));
    doc.getElementById('e5').addEventListener('click', () => hits.push('e5'));
    const listed = jsdom.get_clickable_items().find((item) => item.text === 'e4');

    await jsdom.execute_click(listed.identifier);
    expect(hits).toEqual(['e4']);

    jsdom.get_clickable_items();
    doc.getElementById('e4').textContent = 'resign';
    doc.getElementById('e5').textContent = 'e4';
    await expect(jsdom.execute_click(listed.identifier)).rejects.toThrow(/changed/);
    expect(hits).toEqual(['e4']);

    const rebuilt = domFor('<body><button id="e4">e4</button></body>');
    const first = rebuilt.jsdom.get_clickable_items()[0];
    const replacement = rebuilt.page.window.document.createElement('button');
    replacement.id = 'e4';
    replacement.textContent = 'resign';
    replacement.addEventListener('click', () => hits.push('resign'));
    rebuilt.page.window.document.body.replaceChildren(replacement);
    await expect(rebuilt.jsdom.execute_click(first.identifier)).rejects.toThrow(/changed/);
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
      accept_game: async (link) => {
        calls.accept.push(link);
        return 'game-1';
      },
      open_game: async (id) => {
        calls.open.push(id);
        if (id === 'missing') {
          throw new Error('No local game has that id');
        }
        return id;
      },
      examine_game_move: async (id) => {
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
      receive_manual_input: async (id, input) => {
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
      execute_clickable_item: async (id, identifier) => {
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
    await new GamePage(app, mod).render();
    expect(calls.examined).toEqual([]);
    await mod.manager.examine_game_move('game-1');

    expect(document.querySelector('#gamebot-inspector h2')).toBeNull();
    expect(document.querySelector('.gamebot-inspector-copy').textContent).toBe('Copy');
    const copied = [];
    global.navigator = {
      clipboard: {
        writeText: async (text) => {
          copied.push(text);
        }
      }
    };
    await document.querySelector('.gamebot-inspector-copy').onclick();
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

    await new GamePage(app, mod).render();

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
      path.join(__dirname, '../../../mods/gamebot/web/css/gamebot-game.css'),
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

    const page = new GamePage(app, mod);
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
    expect(tabStyle.backgroundColor).toBe('rgb(255, 216, 74)');
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

    const view = await manager.examine_game_move('game-a');
    const keys = Object.keys(view.context);

    expect(keys[0]).toBe('instructions');
    expect(keys.indexOf('game')).toBeGreaterThan(keys.indexOf('instructions'));
    expect(keys.indexOf('menu')).toBeGreaterThan(keys.indexOf('game'));
    expect(view.context.instructions).toBe(
      'You are playing Twilight Struggle. If it is your turn, select a menu option and return the identifier of the option chosen.'
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
    const view = await manager.examine_game_move('game-a');
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
    const view = await manager.examine_game_move('game-a');
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

    let view = await manager.examine_game_move('game-a');
    expect(view.context.menu).toEqual([
      { id: 'eastgermany', label: 'East Germany', identifier: 'div#eastgermany' }
    ]);

    chess.cardbox.callback = () => {};
    view = await manager.examine_game_move('game-a');
    expect(view.context.menu.map((entry) => entry.id)).toEqual(['asia', 'europe', 'eastgermany']);

    await manager.execute_clickable_item('game-a', 'div#eastgermany');
    expect(placed).toEqual(['eastgermany']);
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
    const view = await manager.examine_game_move('game-a');
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
    const view = await manager.examine_game_move('game-a');
    expect(view.context.menu).toEqual([{ id: 'asia', label: 'Asia', identifier: 'div#asia' }]);
    await manager.execute_clickable_item('game-a', 'div#asia');
    expect(hits).toEqual(['asia']);
  });
});
