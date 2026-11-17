const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');
const Manager = require('../../../mods/gamebot/lib/manager');
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

    await expect(manager.accept_game('not an invite')).rejects.toThrow('Paste an Arcade invite link');
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

  test('open_game accepts a stored id and rejects an unknown id', async () => {
    const { app, manager } = harness();
    app.options.games = [{ id: 'game-a', module: 'Chess' }];
    await expect(manager.open_game('game-a')).resolves.toBe('game-a');
    await expect(manager.open_game('missing')).rejects.toThrow('No local game');
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
    expect(view.context).toEqual({ game: { id: 'game-a', module: 'Chess' } });
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
    const calls = { accept: [], open: [], manual: [], click: [] };
    const app = {
      browser: {
        addElementToDom(html) {
          document.body.insertAdjacentHTML('beforeend', html);
        }
      }
    };
    const mod = { browser_active: true, render() {} };
    mod.manager = {
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
        mod.manager.view = {
          game_id: id,
          slug: 'chess',
          context: { game: { id, target: 2 } },
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

    const accept = document.querySelector('.gamebot-accept');
    accept.querySelector('[name="invite_link"]').value = INVITE;
    await accept.onsubmit({ preventDefault() {} });
    expect(calls.accept).toEqual([INVITE]);
    expect(window.location.hash).toBe('#gid=game-1');

    window.location.hash = '';
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

    expect(document.querySelector('.gamebot-context').textContent).toContain('"target": 2');
    expect(document.querySelector('.gamebot-clickable').textContent).toContain('button#e4');

    const form = document.querySelector('.gamebot-manual');
    form.querySelector('[name="instruction"]').value = 'play e4';
    await form.onsubmit({ preventDefault() {} });

    expect(calls.manual).toEqual([['game-1', 'play e4']]);
    expect(calls.click).toEqual([]);
    expect(document.querySelector('.gamebot-manual-result').textContent).toContain('play e4');
    expect(document.querySelector('.gamebot-manual-result').textContent).toMatch(/No AI is configured/);

    const choice = [...document.querySelectorAll('.gamebot-clickable-actions button')].find(
      (button) => button.textContent === 'button#e4'
    );
    await choice.onclick();
    expect(calls.click).toEqual([['game-1', 'button#e4']]);
    expect(calls.manual).toEqual([['game-1', 'play e4']]);
  });
});
