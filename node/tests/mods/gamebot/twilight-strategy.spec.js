const { EventEmitter } = require('events');
const Manager = require('../../../mods/gamebot/lib/manager');
const AI = require('../../../mods/gamebot/lib/ai');
const GameDom = require('../../../mods/gamebot/lib/jsdom');
const { returnContext, acceptPlan } = require('../../../mods/gamebot/lib/games/twilight');

function cards(ids) {
  return ids.map((id) => ({ id, label: id, identifier: 'div#' + id }));
}

function round(overrides) {
  return {
    menu: cards(['vietnamrevolts', 'marshall']),
    game: {
      player: 1,
      queue: ['play\t1'],
      status: 'USSR pick a card: ',
      countries: {
        thailand: { us: 0, ussr: 1, region: 'seasia' },
        laos: { us: 1, ussr: 0, region: 'seasia' },
        italy: { us: 2, ussr: 0, region: 'europe' }
      },
      deck: [
        {
          cards: {
            vietnamrevolts: { name: 'Vietnam Revolts', scoring: 0, player: 'ussr', ops: 2 },
            marshall: { name: 'Marshall Plan', scoring: 0, player: 'us', ops: 4 },
            asia: { name: 'Asia Scoring', scoring: 1, player: 'both', ops: 0 }
          },
          hand: ['vietnamrevolts', 'marshall']
        }
      ],
      state: { turn: 1, headline: 0, round: 1, defcon: 4 },
      log: []
    },
    ...overrides
  };
}

describe('Twilight action-round recognition', () => {
  test('an ordinary action round asks for one strategic plan', () => {
    const result = returnContext(round());

    expect(result.decision).toBe('strategic_move');
    expect(result.instructions).toContain('"type":"strategic_move"');
    expect(result.instructions).toContain('vietnamrevolts');
    expect(result.instructions).toContain('order "before" or "after"');
  });

  test('headline, scoring, Quagmire, Missile Envy, and UN Intervention stay click by click', () => {
    const cases = [
      round({ game: { ...round().game, status: 'USSR pick your headline card', state: { turn: 1, headline: 1 } } }),
      round({ game: { ...round().game, status: 'Scoring card must be played: ' }, menu: cards(['asia']) }),
      round({ game: { ...round().game, status: 'Bear Trap restricts you to Scoring Cards: ' } }),
      round({ game: { ...round().game, status: 'Quagmire restricts you to Scoring Cards: ' } }),
      round({ game: { ...round().game, status: '' }, menu: cards(['missileenvy']) }),
      round({
        game: {
          ...round().game,
          state: { turn: 1, headline: 0, events: { unintervention: 1 } }
        }
      })
    ];

    for (const sample of cases) {
      expect(returnContext(sample).decision).toBeUndefined();
    }
  });

  test('a strategic response is accepted only for a card on this screen', () => {
    const context = returnContext(round());

    expect(
      acceptPlan(
        {
          type: 'strategic_move',
          card: 'vietnamrevolts',
          play: 'ops',
          operation: 'influence',
          targets: [
            { country: 'thailand', amount: 1 },
            { country: 'laos', amount: 1 }
          ]
        },
        context
      )
    ).toMatchObject({ card: 'vietnamrevolts', stage: 'card', operation: 'influence' });
    expect(
      acceptPlan({ type: 'strategic_move', card: 'missing', play: 'event' }, context)
    ).toBeNull();
    expect(
      acceptPlan(
        {
          type: 'strategic_move',
          card: 'marshall',
          play: 'ops',
          operation: 'influence',
          targets: [{ country: 'france', amount: 1 }]
        },
        context
      )
    ).toBeNull();
    expect(
      acceptPlan({ type: 'strategic_move', card: 'marshall', play: 'ops', order: 'before' }, context)
    ).toMatchObject({ order: 'before', operation: '' });
  });
});

function harness(screen) {
  const clicks = [];
  const app = {
    BROWSER: 1,
    options: { games: [{ id: 'game-a', module: 'Twilight' }] },
    crypto: { hash: (value) => 'hash:' + String(value) },
    connection: new EventEmitter(),
    modules: { mods: [], returnModule: () => null }
  };
  const mod = { publicKey: 'player-key', app };
  mod.ai = new AI(app, mod);
  mod.jsdom = new GameDom(app, mod);
  mod.jsdom.mod = mod;
  const manager = new Manager(app, mod);
  mod.manager = manager;
  const twilight = {
    name: 'Twilight',
    slug: 'twilight',
    game: { id: 'game-a', initializing: 0 },
    returnContext() {
      return JSON.parse(JSON.stringify({ menu: screen.menu, game: screen.game }));
    },
    loadGame(id) {
      this.game.id = id;
      return this.game;
    }
  };
  app.modules.mods.push(twilight);
  app.modules.returnModule = (name) => (name === 'Twilight' ? twilight : null);
  manager.active_game_mod = twilight;
  mod.jsdom.executeClick = async (identifier) => {
    clicks.push(identifier);
    if (screen.onClick) {
      screen.onClick(identifier, manager);
    }
    return identifier;
  };
  return { manager, clicks };
}

describe('Twilight strategic execution', () => {
  test('a plan clicks the card, the operation, and each influence point in order', async () => {
    const screen = round();
    screen.onClick = (identifier) => {
      if (identifier === 'div#vietnamrevolts') {
        screen.menu = [
          { id: 'ops', label: 'play for ops', identifier: 'li#ops' },
          { id: 'event', label: 'trigger event', identifier: 'li#event' }
        ];
        screen.game.status = 'USSR playing Vietnam Revolts';
      }
      if (identifier === 'li#ops') {
        screen.menu = [
          { id: 'place', label: 'place influence', identifier: 'li#place' },
          { id: 'coup', label: 'launch coup', identifier: 'li#coup' },
          { id: 'realign', label: 'realign country', identifier: 'li#realign' }
        ];
        screen.game.status = 'USSR plays 2 OPS:';
      }
      if (identifier === 'li#place') {
        screen.menu = cards(['thailand', 'laos']);
        screen.game.status = 'Place 2 influence';
      }
      if (identifier === 'div#thailand') {
        screen.game.status = 'Place 1 influence';
      }
      if (identifier === 'div#laos') {
        screen.menu = [];
        screen.game.status = 'Waiting for US to move';
      }
    };
    const { manager, clicks } = harness(screen);
    await manager.examineGameState('game-a');

    await manager.handleResponse('game-a', {
      type: 'strategic_move',
      card: 'vietnamrevolts',
      play: 'ops',
      operation: 'influence',
      targets: [
        { country: 'thailand', amount: 1 },
        { country: 'laos', amount: 1 }
      ]
    });

    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops', 'li#place', 'div#thailand', 'div#laos']);
    expect(manager.games['game-a'].plan).toBeUndefined();
  });

  test('a coup is one country click', async () => {
    const screen = round();
    screen.onClick = (identifier) => {
      if (identifier === 'div#vietnamrevolts') {
        screen.menu = [{ id: 'ops', label: 'play for ops', identifier: 'li#ops' }];
      }
      if (identifier === 'li#ops') {
        screen.menu = [{ id: 'coup', label: 'launch coup', identifier: 'li#coup' }];
        screen.game.status = 'USSR plays 2 OPS:';
      }
      if (identifier === 'li#coup') {
        screen.menu = cards(['italy']);
        screen.game.status = 'Pick a country to coup';
      }
      if (identifier === 'div#italy') {
        screen.menu = [];
        screen.game.status = 'Waiting for US to move';
      }
    };
    const { manager, clicks } = harness(screen);
    await manager.examineGameState('game-a');

    await manager.handleResponse('game-a', {
      type: 'strategic_move',
      card: 'vietnamrevolts',
      play: 'ops',
      operation: 'coup',
      targets: [{ country: 'italy', amount: 1 }]
    });

    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops', 'li#coup', 'div#italy']);
  });

  test('realignment clicks its countries and then ends the rolls that remain', async () => {
    const screen = round();
    screen.onClick = (identifier) => {
      if (identifier === 'div#vietnamrevolts') {
        screen.menu = [{ id: 'ops', label: 'play for ops', identifier: 'li#ops' }];
      }
      if (identifier === 'li#ops') {
        screen.menu = [{ id: 'realign', label: 'realign country', identifier: 'li#realign' }];
      }
      if (identifier === 'li#realign') {
        screen.menu = [{ id: 'cancelrealign', label: 'end turn without rolling', identifier: 'li#cancelrealign' }];
        screen.game.status = 'Pick a target to realign (2 rolls), or:';
      }
      if (identifier === 'div#italy') {
        screen.game.status = 'Pick a target to realign (1 rolls), or:';
      }
      if (identifier === 'li#cancelrealign') {
        screen.menu = [];
        screen.game.status = 'Waiting for US to move';
      }
    };
    const { manager, clicks } = harness(screen);
    await manager.examineGameState('game-a');

    await manager.handleResponse('game-a', {
      type: 'strategic_move',
      card: 'vietnamrevolts',
      play: 'ops',
      operation: 'realign',
      targets: [{ country: 'italy', amount: 1 }]
    });

    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops', 'li#realign', 'div#italy', 'li#cancelrealign']);
  });

  test('a move submission stops the plan until the queue is stable again', async () => {
    const screen = round();
    screen.onClick = (identifier, manager) => {
      if (identifier === 'div#vietnamrevolts') {
        screen.menu = [{ id: 'ops', label: 'play for ops', identifier: 'li#ops' }];
      }
      if (identifier === 'li#ops') {
        manager.games['game-a'].last_queue_stable = 50;
        screen.menu = [
          { id: 'place', label: 'place influence', identifier: 'li#place' },
          { id: 'coup', label: 'launch coup', identifier: 'li#coup' }
        ];
        screen.game.status = 'USSR plays 2 OPS:';
      }
      if (identifier === 'li#place') {
        screen.menu = [];
        screen.game.status = 'Waiting for US to move';
      }
    };
    const { manager, clicks } = harness(screen);
    await manager.examineGameState('game-a');

    await manager.handleResponse('game-a', {
      type: 'strategic_move',
      card: 'vietnamrevolts',
      play: 'ops',
      operation: 'influence',
      targets: [{ country: 'thailand', amount: 1 }]
    });

    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops']);
    expect(manager.games['game-a'].plan.stage).toBe('operation');

    await manager.examineGameState('game-a', 50);

    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops', 'li#place']);
  });

  test('a missing country aborts the remainder and the next look is an ordinary decision', async () => {
    const screen = round();
    screen.onClick = (identifier) => {
      if (identifier === 'div#vietnamrevolts') {
        screen.menu = [{ id: 'ops', label: 'play for ops', identifier: 'li#ops' }];
      }
      if (identifier === 'li#ops') {
        screen.menu = [{ id: 'place', label: 'place influence', identifier: 'li#place' }];
      }
      if (identifier === 'li#place') {
        screen.menu = cards(['laos', 'italy']);
        screen.game.status = 'Place 1 influence';
      }
    };
    const { manager, clicks } = harness(screen);
    await manager.examineGameState('game-a');

    await manager.handleResponse('game-a', {
      type: 'strategic_move',
      card: 'vietnamrevolts',
      play: 'ops',
      operation: 'influence',
      targets: [{ country: 'thailand', amount: 1 }]
    });

    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops', 'li#place']);
    expect(manager.games['game-a'].plan).toBeUndefined();
    expect(manager.view.context.decision).toBeUndefined();
    expect(manager.view.context.instructions).not.toContain('strategic_move');
    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops', 'li#place']);
  });

  test('playing a stored plan does not spend an AI attempt', async () => {
    const screen = round();
    screen.onClick = (identifier) => {
      if (identifier === 'div#vietnamrevolts') {
        screen.menu = [
          { id: 'ops', label: 'play for ops', identifier: 'li#ops' },
          { id: 'event', label: 'trigger event', identifier: 'li#event' }
        ];
        screen.game.status = 'USSR playing Vietnam Revolts';
      }
      if (identifier === 'li#ops') {
        screen.menu = [
          { id: 'place', label: 'place influence', identifier: 'li#place' },
          { id: 'coup', label: 'launch coup', identifier: 'li#coup' }
        ];
        screen.game.status = 'USSR plays 2 OPS:';
      }
      if (identifier === 'li#place') {
        screen.menu = cards(['thailand', 'laos']);
        screen.game.status = 'Place 2 influence';
      }
      if (identifier === 'div#thailand') {
        screen.game.status = 'Place 1 influence';
      }
      if (identifier === 'div#laos') {
        screen.menu = [];
        screen.game.status = 'Waiting for US to move';
      }
    };
    const { manager } = harness(screen);
    let asked = 0;
    const publish = manager.mod.ai.requestResponse.bind(manager.mod.ai);
    manager.mod.ai.requestResponse = async (context) => {
      asked += 1;
      return publish(context);
    };
    await manager.examineGameState('game-a');
    const attempts = manager.games['game-a'].attempts;

    await manager.handleResponse('game-a', {
      type: 'strategic_move',
      card: 'vietnamrevolts',
      play: 'ops',
      operation: 'influence',
      targets: [
        { country: 'thailand', amount: 1 },
        { country: 'laos', amount: 1 }
      ]
    });

    expect(asked).toBe(1);
    expect(manager.games['game-a'].attempts).toBe(attempts);
  });

  test('an aborted plan does not ask the AI again', async () => {
    const screen = round();
    screen.onClick = (identifier) => {
      if (identifier === 'div#vietnamrevolts') {
        screen.menu = [{ id: 'ops', label: 'play for ops', identifier: 'li#ops' }];
      }
      if (identifier === 'li#ops') {
        screen.menu = [{ id: 'place', label: 'place influence', identifier: 'li#place' }];
      }
      if (identifier === 'li#place') {
        screen.menu = cards(['laos', 'italy']);
      }
    };
    const { manager, clicks } = harness(screen);
    let asked = 0;
    const publish = manager.mod.ai.requestResponse.bind(manager.mod.ai);
    manager.mod.ai.requestResponse = async (context) => {
      asked += 1;
      return publish(context);
    };
    await manager.examineGameState('game-a');

    await manager.mod.ai.receiveResponse('game-a', {
      type: 'strategic_move',
      card: 'vietnamrevolts',
      play: 'ops',
      operation: 'influence',
      targets: [{ country: 'thailand', amount: 1 }],
      timestamp: 0
    });

    expect(clicks).toEqual(['div#vietnamrevolts', 'li#ops', 'li#place']);
    expect(asked).toBe(2);
    expect(manager.games['game-a'].attempts).toBe(2);
    expect(manager.games['game-a'].plan).toBeUndefined();
  });
});
