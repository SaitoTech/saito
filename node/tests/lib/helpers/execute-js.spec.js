// Lite Client bundles sandbox-browser.js (no worker_threads). Jest has no DOM
// iframe path, so substitute the server helper for createSandbox only.
jest.mock('../../../lib/helpers/sandbox-browser', () =>
  require('../../../lib/helpers/sandbox-server')
);

const sanitizeHelper = require('../../../lib/helpers/sanitize');
const {
  sanitizeJS,
  executeJS,
  serializeTransferable
} = sanitizeHelper;
const Browser = require('../../../lib/saito/browser').default;

afterEach(() => {
  if (sanitizeHelper.sandbox) {
    sanitizeHelper.sandbox.terminate();
    sanitizeHelper.sandbox = null;
  }
});

describe('serializeTransferable', () => {
  test('accepts plain JSON data', () => {
    expect(serializeTransferable({ a: 1, b: [true, 'x'] })).toEqual({ a: 1, b: [true, 'x'] });
  });

  test('rejects functions, cycles and class instances', () => {
    expect(() => serializeTransferable({ fn: () => {} })).toThrow(/function/i);
    const cycle = {};
    cycle.self = cycle;
    expect(() => serializeTransferable(cycle)).toThrow(/Circular/i);
    expect(() => serializeTransferable(new Date())).toThrow(/Unsupported/);
  });
});

describe('executeJS', () => {
  test('executes simple JavaScript and returns a result', async () => {
    const result = await executeJS('return 1 + 2;', {}, {});
    expect(result).toBe(3);
  });

  test('exposes optional args binding in order', async () => {
    const result = await executeJS('return args[0] + ":" + args[1] + ":" + args.length;', {
      args: ['alpha', 'beta', 'gamma']
    });
    expect(result).toBe('alpha:beta:3');
  });

  test('defaults omitted args to an empty array', async () => {
    const result = await executeJS('return args.length;', {});
    expect(result).toBe(0);
  });

  test('existing callers without args continue working', async () => {
    const result = await executeJS('return context.value;', {
      context: { value: 7 }
    });
    expect(result).toBe(7);
  });

  test('disallowed APIs remain blocked when args is present', async () => {
    await expect(
      executeJS('return eval("1");', { args: ['x'] }, {})
    ).rejects.toThrow(/validation failed/i);
  });

  test('reuses the persistent sandbox across calls', async () => {
    const first = await executeJS('return context.left + context.right;', {
      context: { left: 2, right: 2 }
    });
    const sandboxRef = sanitizeHelper.sandbox;
    expect(sandboxRef).toBeTruthy();
    expect(sandboxRef.isTerminated()).toBe(false);

    const second = await executeJS('return context.left * context.right;', {
      context: { left: 3, right: 5 }
    });
    expect(first).toBe(4);
    expect(second).toBe(15);
    expect(sanitizeHelper.sandbox).toBe(sandboxRef);
  });

  test('executes local functions', async () => {
    const result = await executeJS(
      `
      function add(a, b) {
        return a + b;
      }
      return add(4, 5);
      `,
      {},
      {}
    );
    expect(result).toBe(9);
  });

  test('supplies serialized context object to the worker', async () => {
    const result = await executeJS('return context.player + context.phase;', {
      context: { player: 1, phase: 10 }
    });
    expect(result).toBe(11);
  });

  test('invokes authorized host api methods and returns values', async () => {
    const calls = [];
    const result = await executeJS(
      `
      const before = await api.getCountry("France");
      await api.addInfluence("France", 2);
      return before;
      `,
      {
        api: {
          getCountry: async (country) => ({ country, influence: 1 }),
          addInfluence: async (country, amount) => {
            calls.push([country, amount]);
            return true;
          }
        }
      }
    );
    expect(result).toEqual({ country: 'France', influence: 1 });
    expect(calls).toEqual([['France', 2]]);
  });

  test('rejects unauthorized api methods from the worker', async () => {
    await expect(
      executeJS('return await api.pay(1);', {
        api: {
          addInfluence: async () => true
        }
      })
    ).rejects.toThrow(/validation failed/i);
  });

  test('runs ordinary JavaScript and returns the result', async () => {
    const result = await executeJS(
      `
      function calculateInfluence(amount) {
        return Number(amount) + Math.min(2, parseInt("1", 10));
      }
      const board = { egypt: 1, france: 0 };
      const placed = {};
      for (const id of Object.keys(board)) {
        if (board[id] > 0) {
          placed[id] = board[id] + calculateInfluence("2");
        }
      }
      class Tally {
        constructor(total) {
          this.total = total;
        }
        add(n) {
          this.total = this.total + n;
          return this.total;
        }
      }
      const tally = new Tally(0);
      const total = Object.keys(placed).reduce((sum, id) => tally.add(placed[id]), 0);
      return { total, egypt: placed.egypt, json: JSON.parse(JSON.stringify(placed)).egypt };
      `,
      {},
      {}
    );
    expect(result).toEqual({ total: 4, egypt: 4, json: 4 });
  });

  test('invokes an exposed api method through computed access', async () => {
    const calls = [];
    const result = await executeJS(
      `
      const name = "addInfluence";
      return await api[name]("egypt", 2);
      `,
      {
        api: {
          addInfluence: async (country, amount) => {
            calls.push([country, amount]);
            return country + ":" + amount;
          }
        }
      }
    );
    expect(result).toBe('egypt:2');
    expect(calls).toEqual([['egypt', 2]]);
  });

  test('computed api access cannot invoke a method the host did not expose', async () => {
    const calls = [];
    await expect(
      executeJS(
        `
        const name = "launchNukes";
        return await api[name]();
        `,
        {
          api: {
            addInfluence: async () => {
              calls.push('addInfluence');
              return true;
            }
          }
        }
      )
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  test('rejects host, node, network, eval and worker access at validation', async () => {
    const blocked = [
      'window.alert(1)',
      'document.body',
      'globalThis.location',
      'require("fs")',
      'process.exit(1)',
      'fetch("https://example.com")',
      'new XMLHttpRequest()',
      'eval("1")',
      'Function("return 1")()',
      'new Worker("w.js")',
      'localStorage.getItem("a")',
      'indexedDB.open("db")'
    ];
    for (const source of blocked) {
      await expect(executeJS(source, { api: { addInfluence: async () => true } })).rejects.toThrow(
        /validation failed/i
      );
    }
    expect(sanitizeHelper.sandbox).toBe(null);
  });

  test('rejects unauthorized methods at validation time', async () => {
    await expect(
      executeJS('await api.launchNukes();', {
        api: {
          addInfluence: async () => true
        }
      })
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects the legacy game API namespace', async () => {
    await expect(
      executeJS('return await game.ping();', {
        api: {
          ping: async () => 1
        }
      })
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects nested legacy api.game shape at normalize time', async () => {
    await expect(
      executeJS('return 1;', {
        api: {
          game: {
            ping: async () => 1
          }
        }
      })
    ).rejects.toThrow(/must be a function|nested API namespaces/i);
  });

  test('rejects invalid execution context before creating a sandbox', async () => {
    await expect(
      executeJS('return 1;', {
        context: { node: global }
      })
    ).rejects.toThrow(/Invalid execution context/i);
    expect(sanitizeHelper.sandbox).toBe(null);
  });

  test('rejects host api results that cannot be serialized', async () => {
    await expect(
      executeJS('return await api.leak();', {
        api: {
          leak: async () => global
        }
      })
    ).rejects.toThrow();
  });

  test('enforces execution timeout', async () => {
    await expect(
      executeJS(
        `
        while (true) {}
        `,
        {},
        { maxExecutionTime: 200 }
      )
    ).rejects.toThrow(/timed out|terminated|Worker|Sandbox/i);
  }, 10000);

  test('default policy still times out long host awaits', async () => {
    await expect(
      executeJS(
        `
        return await api.wait();
        `,
        {
          api: {
            wait: () => new Promise((resolve) => setTimeout(() => resolve(1), 5500))
          }
        }
      )
    ).rejects.toThrow(/timed out|terminated|Worker|Sandbox/i);
  }, 15000);

  test('maxExecutionTime 0 allows host awaits longer than five seconds', async () => {
    const result = await executeJS(
      `
      return await api.wait();
      `,
      {
        api: {
          wait: () => new Promise((resolve) => setTimeout(() => resolve(42), 5500))
        }
      },
      { maxExecutionTime: 0 }
    );
    expect(result).toBe(42);
  }, 15000);

  test('enforces maxMessages', async () => {
    let n = 0;
    await expect(
      executeJS(
        `
        await api.ping();
        await api.ping();
        await api.ping();
        return 1;
        `,
        {
          api: {
            ping: async () => {
              n += 1;
              return n;
            }
          }
        },
        { maxMessages: 2 }
      )
    ).rejects.toThrow(/maxMessages/i);
  });

  test('failed sanitizeJS prevents execution', async () => {
    await expect(executeJS('eval("1")', {}, {})).rejects.toThrow(/validation failed/i);
    expect(sanitizeHelper.sandbox).toBe(null);
  });

  test('validation errors are attached to the thrown error', async () => {
    try {
      await executeJS('window.alert(1)', {}, {});
      throw new Error('expected validation failure');
    } catch (err) {
      expect(err.message).toMatch(/validation failed/i);
      expect(err.validation).toBeDefined();
      expect(err.validation.safe).toBe(false);
    }
  });

  test('rejects window/document/globalThis/localStorage style sources', async () => {
    const banned = ['window', 'document', 'globalThis', 'localStorage', 'app.options', 'app.wallet'];
    for (const expr of banned) {
      await expect(executeJS(`return ${expr};`, {}, {})).rejects.toThrow(/validation failed/i);
    }
  });

  test('Browser.executeJS delegates to the helper', async () => {
    const browser = new Browser({});
    const result = await browser.executeJS('return 21 * 2;', {}, {});
    expect(result).toBe(42);
  });

  test('sanitizeJS is invoked before execution', async () => {
    await expect(executeJS('return 1;', {}, {})).resolves.toBe(1);
    await expect(executeJS('eval("1")', {}, {})).rejects.toThrow(/validation failed/i);
  });

  test('allows nested reads of context.game', async () => {
    const result = await executeJS(
      `
      return context.game.options.nfts[0].id + ":" + context.game.state.round + ":" + context.game.countries.canada.us;
      `,
      {
        context: {
          game: {
            player: 1,
            state: { round: 3 },
            countries: { canada: { us: 2 } },
            options: { nfts: [{ id: 'nft-test-title-105' }] },
            queue: ['resolve\tnft-test-title-105'],
            deck: [{ hand: ['nft-test-title-105'] }]
          }
        }
      }
    );
    expect(result).toBe('nft-test-title-105:3:2');
  });

  test('rejects assignment to nested context.game at validation time', async () => {
    await expect(
      executeJS('context.game.player = 9; return context.game.player;', {
        context: { game: { player: 1 } }
      })
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects mutation calls through context.game at validation time', async () => {
    await expect(
      executeJS('context.game.queue.push(1); return 1;', {
        context: { game: { queue: [] } }
      })
    ).rejects.toThrow(/validation failed/i);
  });

  test('context.game snapshot mutations cannot affect the live host object', async () => {
    const liveGame = {
      player: 1,
      state: { round: 3 },
      queue: ['play']
    };
    const snapshot = JSON.parse(JSON.stringify(liveGame));

    await expect(
      executeJS('context.game.player = 99; return context.game.player;', {
        context: { game: snapshot }
      })
    ).rejects.toThrow(/validation failed/i);

    expect(liveGame.player).toBe(1);
    expect(liveGame.state.round).toBe(3);
    expect(liveGame.queue).toEqual(['play']);
    expect(snapshot.player).toBe(1);
  });

  test('api and context.game coexist without colliding', async () => {
    const result = await executeJS(
      `
      const player = context.game.player;
      await api.ping();
      return player;
      `,
      {
        context: { game: { player: 2, state: { defcon: 3 } } },
        api: {
          ping: async () => true
        }
      }
    );
    expect(result).toBe(2);
  });

  test('runs the Test NFT sequence with api.addToQueue and context.game', async () => {
    const moves = [];
    const result = await executeJS(
      `
      api.addToQueue("place\\tus\\tus\\tegypt\\t2");
      api.addToQueue("resolve\\tnft-test-title-105");
      await api.endTurn();
      return context.game.options.nfts[0].id;
      `,
      {
        context: {
          game: {
            player: 1,
            options: { nfts: [{ id: 'nft-test-title-105', title: 'NFT TEST TITLE' }] }
          }
        },
        api: {
          addToQueue: (mv) => {
            moves.push(['addToQueue', mv]);
            return mv;
          },
          endTurn: async () => {
            moves.push(['endTurn']);
            return true;
          }
        }
      }
    );
    expect(result).toBe('nft-test-title-105');
    expect(moves).toEqual([
      ['addToQueue', 'place\tus\tus\tegypt\t2'],
      ['addToQueue', 'resolve\tnft-test-title-105'],
      ['endTurn']
    ]);
  });

  test('awaits playerSelectOption then addToQueue', async () => {
    const moves = [];
    const result = await executeJS(
      `
      const choice = await api.playerSelectOption([
        { id: "india", label: "India" },
        { id: "pakistan", label: "Pakistan" }
      ]);
      api.addToQueue("place\\tus\\tus\\t" + choice + "\\t2");
      api.addToQueue("resolve\\tcard");
      await api.endTurn();
      return choice;
      `,
      {
        api: {
          playerSelectOption: async (options) => {
            moves.push(['playerSelectOption', options.map((o) => o.id)]);
            return await new Promise((resolve) => {
              setTimeout(() => resolve('pakistan'), 0);
            });
          },
          addToQueue: (mv) => moves.push(['addToQueue', mv]),
          endTurn: async () => {
            moves.push(['endTurn']);
            return true;
          }
        }
      }
    );
    expect(result).toBe('pakistan');
    expect(moves).toEqual([
      ['playerSelectOption', ['india', 'pakistan']],
      ['addToQueue', 'place\tus\tus\tpakistan\t2'],
      ['addToQueue', 'resolve\tcard'],
      ['endTurn']
    ]);
  });

  test('ignores legacy capabilities/data property names', async () => {
    await expect(
      executeJS('return left;', {
        data: { left: 2 }
      })
    ).rejects.toThrow(/validation failed/i);

    await expect(
      executeJS('return await api.ping();', {
        capabilities: {
          ping: async () => 1
        }
      })
    ).rejects.toThrow(/validation failed/i);
  });
});
