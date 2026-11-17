const GameTemplate = require('../../../lib/templates/gametemplate');

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
    BROWSER: 0,
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
  mod.uses_jsdom = 0;
  mod.jsdom = null;
  mod.newGame = (id) => gameRecord(id);
  mod.saveGame = async function () {
    return this.game && this.game.id;
  };
  return mod;
}

const saved_globals = {
  window: global.window,
  document: global.document,
  navigator: global.navigator,
  $: global.$,
  jQuery: global.jQuery
};

afterEach(() => {
  if (global.window && global.window !== saved_globals.window && typeof global.window.close === 'function') {
    global.window.close();
  }
  global.window = saved_globals.window;
  global.document = saved_globals.document;
  global.navigator = saved_globals.navigator;
  global.$ = saved_globals.$;
  global.jQuery = saved_globals.jQuery;
});

test('uses_jsdom defaults to zero', () => {
  const mod = new GameTemplate({
    options: {},
    connection: { on() {} }
  });
  expect(mod.uses_jsdom).toBe(0);
  expect(mod.jsdom).toBe(null);
  expect(mod.process_future_moves_depth).toEqual({});
  expect(mod.process_future_moves_boundary).toEqual({});
});

test('loadGameWithJSDOM enables the flag and installs a document', async () => {
  const mod = loadableModule({ game_a: gameRecord('game_a') });
  const loaded = await mod.loadGameWithJSDOM('game_a');

  expect(loaded.id).toBe('game_a');
  expect(mod.uses_jsdom).toBe(1);
  expect(mod.game.id).toBe('game_a');
  expect(global.document).toBe(mod.jsdom.window.document);
  expect(global.document.body.tagName).toBe('BODY');
  expect(global.$.fn).toBeTruthy();
  expect(global.$('body')[0]).toBe(global.document.body);
});

test('a later loadGame keeps the flag and replaces the document', async () => {
  const mod = loadableModule({
    game_a: gameRecord('game_a'),
    game_a2: gameRecord('game_a')
  });
  await mod.loadGameWithJSDOM('game_a');
  const first_document = global.document;
  const first_window = global.window;

  await mod.loadGame('game_a');

  expect(mod.uses_jsdom).toBe(1);
  expect(global.document).not.toBe(first_document);
  expect(global.window).not.toBe(first_window);
  expect(global.document).toBe(mod.jsdom.window.document);
  expect(global.$('body')[0].ownerDocument).toBe(global.document);
});

test('loading another game keeps the flag and installs another document', async () => {
  const mod = loadableModule({
    game_a: gameRecord('game_a'),
    game_b: gameRecord('game_b')
  });
  await mod.loadGameWithJSDOM('game_a');
  global.$('<div id="from-a"></div>').appendTo('body');
  const first_document = global.document;

  const marker = first_document.getElementById('from-a');
  await mod.loadGame('game_b');

  expect(mod.uses_jsdom).toBe(1);
  expect(mod.game.id).toBe('game_b');
  expect(global.document).not.toBe(first_document);
  expect(global.document.contains(marker)).toBe(false);
  expect(global.document.getElementById('from-a')).toBe(null);
  expect(global.$('body')[0]).toBe(global.document.body);
});

test('a superseded load does not replace the active document', async () => {
  const records = {
    game_a: gameRecord('game_a'),
    game_b: gameRecord('game_b'),
    game_c: gameRecord('game_c')
  };
  const mod = loadableModule(records);
  await mod.loadGameWithJSDOM('game_a');

  let release_b;
  mod.app.storage.loadDataFile = async (namespace, id) => {
    if (id === 'game_b') {
      await new Promise((resolve) => {
        release_b = resolve;
      });
    }
    return records[id];
  };

  const pending_b = mod.loadGame('game_b');
  await Promise.resolve();
  await mod.loadGame('game_c');
  const document_c = global.document;
  const window_c = mod.jsdom;

  release_b();
  await pending_b;

  expect(mod.uses_jsdom).toBe(1);
  expect(mod.game.id).toBe('game_c');
  expect(global.document).toBe(document_c);
  expect(mod.jsdom).toBe(window_c);
});

test('an activation hold does not replace the active document', async () => {
  const mod = loadableModule({
    game_a: gameRecord('game_a'),
    game_b: gameRecord('game_b')
  });
  await mod.loadGameWithJSDOM('game_a');
  const first_document = global.document;
  mod._activation_hold = 1;

  const loaded = await mod.loadGame('game_b');

  expect(loaded.id).toBe('game_b');
  expect(mod.game.id).toBe('game_a');
  expect(mod.uses_jsdom).toBe(1);
  expect(global.document).toBe(first_document);
  expect(mod.jsdom.window.document).toBe(first_document);
});

test('uses_jsdom zero does not create a document', async () => {
  const mod = loadableModule({ game_a: gameRecord('game_a') });
  const before = global.document;

  const loaded = await mod.loadGame('game_a');

  expect(loaded.id).toBe('game_a');
  expect(mod.uses_jsdom).toBe(0);
  expect(mod.jsdom).toBe(null);
  expect(global.document).toBe(before);
  expect(global.$).toBe(saved_globals.$);
});

test('jquery uses the document from the latest load', async () => {
  const mod = loadableModule({
    game_a: gameRecord('game_a'),
    game_b: gameRecord('game_b'),
    game_c: gameRecord('game_c')
  });

  await mod.loadGameWithJSDOM('game_a');
  global.$('<span id="mark"></span>').appendTo('body');
  const first_$ = global.$;
  const first_document = global.document;
  expect(first_$('#mark').length).toBe(1);

  await mod.loadGame('game_b');
  expect(global.$).not.toBe(first_$);
  expect(global.$('#mark').length).toBe(0);
  expect(global.$('body')[0]).toBe(global.document.body);
  global.$('<span id="second"></span>').appendTo('body');
  expect(global.$('#second')[0].ownerDocument).toBe(global.document);
  const second_$ = global.$;
  const second_document = global.document;

  await mod.loadGame('game_c');
  expect(mod.uses_jsdom).toBe(1);
  expect(global.$).not.toBe(second_$);
  expect(global.$('#second').length).toBe(0);
  expect(global.$('#mark').length).toBe(0);
  expect(second_document.getElementById('second')).toBe(null);
  expect(global.jQuery).toBe(global.$);
  expect(global.$('body')[0]).toBe(global.document.body);
  expect(mod.jsdom.window.$).toBe(global.$);
});
