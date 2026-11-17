const { JSDOM } = require('jsdom');
const GameBotAI = require('../../../mods/gamebot/lib/ai');
const GameDom = require('../../../mods/gamebot/lib/jsdom');
const Manager = require('../../../mods/gamebot/lib/manager');
const { parseInvitation } = require('../../../mods/gamebot/lib/manager');
const Main = require('../../../mods/gamebot/lib/ui/main');
const GamePage = require('../../../mods/gamebot/lib/ui/game');

function gameMod(game) {
  return {
    returnContext() {
      return { game };
    }
  };
}

describe('GameBot manual runner', () => {
  const ai = new GameBotAI({}, {});

  test('parses an Arcade invite link and a bare game id', () => {
    const link = parseInvitation(
      'https://saito.io/arcade/?game=chess&game_id=abcDEF1234567890&invite=1'
    );
    expect(link.game).toBe('chess');
    expect(link.game_id).toBe('abcDEF1234567890');
    expect(parseInvitation('abcDEF1234567890').game_id).toBe('abcDEF1234567890');
    expect(parseInvitation('not an invite')).toBeNull();
  });

  test('shouldMove uses only the game snapshot', () => {
    expect(ai.shouldMove(gameMod({ player: 1, target: 1, over: 0 })).move).toBe(true);
    expect(ai.shouldMove(gameMod({ player: 1, target: 2, over: 0 })).move).toBe(false);
    expect(ai.shouldMove(gameMod({ player: 1, over: 0 })).move).toBeNull();
    expect(ai.shouldMove(gameMod({ player: 0, target: 0, over: 0 })).move).toBe(false);
    expect(ai.shouldMove({ returnContext: () => ({}) }).move).toBeNull();
  });

  test('resolve accepts a number, an id, or a unique label', () => {
    const interactions = [
      { id: 'menu:ops', value: 'ops', label: 'Place influence' },
      { id: 'menu:coup', value: 'coup', label: 'Coup' }
    ];
    expect(ai.resolve('2', interactions).value).toBe('coup');
    expect(ai.resolve('menu:ops', interactions).value).toBe('ops');
    expect(ai.resolve('Coup', interactions).value).toBe('coup');
    expect(ai.resolve('Place', interactions)).toBeNull();
  });

  test('executeMove runs the captured game callback', async () => {
    const chosen = [];
    const mod = {
      name: 'Chess',
      hud: {
        updateStatus() {},
        updateMenu() {},
        updateCards() {}
      },
      cardbox: { bindCallback() {} },
      returnContext() {
        return { game: { player: 1, target: 1, over: 0, id: 'g1' } };
      }
    };
    const dom = new GameDom({}, { manager: { captureContext() {} } });
    dom.watch(mod);
    mod.hud.updateMenu([{ id: 'resign', label: 'Resign' }], (id) => {
      chosen.push(id);
    });

    const result = await ai.executeMove(mod, '1', dom);
    expect(result.id).toBe('menu:resign');
    expect(chosen).toEqual(['resign']);
    expect(dom.interactions(mod).map((item) => item.id)).toEqual(['menu:resign']);
  });

  test('a DOM click handler is executed without a second rules engine', async () => {
    const hits = [];
    const mod = {
      name: 'Chess',
      game: { id: 'g1', status: 'choose' },
      hud: {
        updateStatus() {},
        updateMenu() {},
        updateCards() {}
      },
      cardbox: { bindCallback() {} }
    };
    const dom = new GameDom({}, { manager: { captureContext() {} } });
    dom.mount(mod);
    const button = dom.sessionFor(mod).document.createElement('button');
    button.id = 'e4';
    button.textContent = 'e4';
    button.onclick = function () {
      hits.push(this.id);
    };
    dom.sessionFor(mod).document.getElementById('gamebot-dom').append(button);

    await dom.execute(mod, { kind: 'element', value: 'e4', id: 'element:e4' });
    expect(hits).toEqual(['e4']);
    expect(dom.interactions(mod).some((item) => item.id === 'element:e4')).toBe(true);
  });

  test('acceptInvitation joins through Arcade', async () => {
    const joined = [];
    const tx = {
      signature: 'abcDEF1234567890',
      msg: { game: 'Chess', request: 'open', options: {} },
      returnMessage() {
        return this.msg;
      }
    };
    const chess = {
      name: 'Chess',
      hud: {
        updateStatus() {},
        updateMenu() {},
        updateCards() {}
      },
      cardbox: { bindCallback() {} },
      saveGame() {}
    };
    const app = {
      options: { games: [] },
      storage: { saveOptions() {} },
      connection: { on() {} },
      modules: {
        mods: [],
        returnModule(name) {
          if (name === 'Arcade') {
            return {
              returnGameInvite: async () => ({ game_tx: tx, from_archive: false }),
              isAvailableGame: () => true,
              addInviteRecord() {},
              sendJoinTransaction: async (invite) => {
                joined.push(invite.tx.signature);
              }
            };
          }
          if (name === 'Chess') {
            return chess;
          }
          return null;
        }
      }
    };
    const mod = { publicKey: 'player-key', dom: null };
    mod.dom = new GameDom(app, mod);
    const manager = new Manager(app, mod);

    const record = await manager.acceptInvitation(
      'https://saito.io/arcade/?game=chess&game_id=abcDEF1234567890'
    );

    expect(joined).toEqual(['abcDEF1234567890']);
    expect(record.status).toBe('joining');
    expect(tx.msg.options.desired_opponent_publickey).toBe('player-key');
    expect(manager.records()).toHaveLength(1);
  });

  test('the dashboard and game page render', () => {
    const page = new JSDOM('<!DOCTYPE html><body></body></html>', {
      url: 'https://gamebot.invalid/gamebot/'
    });
    const previous = { window: global.window, document: global.document };
    global.window = page.window;
    global.document = page.window.document;

    const chess = {
      name: 'Chess',
      game: { id: 'abcDEF1234567890', player: 1, target: 2, over: 0, status: 'waiting' },
      hud: {
        updateStatus() {},
        updateMenu(options, callback) {
          this.menu = options;
          this.callback = callback;
        },
        updateCards() {}
      },
      cardbox: { bindCallback() {} },
      saveGame() {},
      loadGame() {},
      returnContext() {
        return { game: this.game };
      }
    };
    const app = {
      browser: {
        addElementToDom(html) {
          document.body.insertAdjacentHTML('beforeend', html);
        }
      },
      options: {
        games: [{ id: 'abcDEF1234567890', module: 'Chess', player: 1, target: 2, over: 0 }],
        gamebot: {
          games: {
            abcDEF1234567890: {
              id: 'abcDEF1234567890',
              module: 'Chess',
              status: 'active',
              accepted_at: 1
            }
          }
        }
      },
      storage: { saveOptions() {} },
      connection: { on() {} },
      modules: {
        mods: [chess],
        returnModule(name) {
          return name === 'Chess' ? chess : null;
        }
      }
    };
    const mod = { publicKey: 'player-key' };
    mod.dom = new GameDom(app, mod);
    mod.ai = new GameBotAI(app, mod);
    mod.manager = new Manager(app, mod);

    try {
      new Main(app, mod).render();
      expect(document.querySelector('.gamebot-game-title').textContent).toBe('Chess');
      expect(document.querySelector('.gamebot-accept textarea')).not.toBeNull();

      window.location.hash = 'gid=abcDEF1234567890';
      new GamePage(app, mod).render();
      expect(document.querySelector('.gamebot-log-entry pre').textContent).toContain('"target": 2');
      expect(document.querySelector('.gamebot-decision').textContent).toContain('another seat');
      expect(document.querySelector('.gamebot-board-frame')).not.toBeNull();
    } finally {
      global.window = previous.window;
      global.document = previous.document;
    }
  });
});
