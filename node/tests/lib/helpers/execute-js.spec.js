// Lite Client bundles browser sandbox.js (no worker_threads). Jest has no DOM
// iframe path, so substitute the Node test helper for createSandbox only.
jest.mock('../../../lib/helpers/sandbox', () => require('../../../lib/helpers/sandbox-node'));

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

  test('reuses the persistent sandbox across calls', async () => {
    const first = await executeJS('return left + right;', {
      data: { left: 2, right: 2 }
    });
    const sandboxRef = sanitizeHelper.sandbox;
    expect(sandboxRef).toBeTruthy();
    expect(sandboxRef.isTerminated()).toBe(false);

    const second = await executeJS('return left * right;', {
      data: { left: 3, right: 5 }
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

  test('supplies serialized data to the worker', async () => {
    const result = await executeJS('return player + phase;', {
      data: { player: 1, phase: 10 }
    });
    expect(result).toBe(11);
  });

  test('invokes authorized host capabilities and returns values', async () => {
    const calls = [];
    const result = await executeJS(
      `
      const before = await game.getCountry("France");
      await game.addInfluence("France", 2);
      return before;
      `,
      {
        capabilities: {
          game: {
            getCountry: async (country) => ({ country, influence: 1 }),
            addInfluence: async (country, amount) => {
              calls.push([country, amount]);
              return true;
            }
          }
        }
      }
    );
    expect(result).toEqual({ country: 'France', influence: 1 });
    expect(calls).toEqual([['France', 2]]);
  });

  test('rejects unauthorized capability namespaces from the worker', async () => {
    await expect(
      executeJS('return await wallet.pay(1);', {
        capabilities: {
          game: {
            addInfluence: async () => true
          }
        }
      })
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects unauthorized methods at validation time', async () => {
    await expect(
      executeJS('await game.launchNukes();', {
        capabilities: {
          game: {
            addInfluence: async () => true
          }
        }
      })
    ).rejects.toThrow(/validation failed/i);
  });

  test('rejects invalid context data before creating a sandbox', async () => {
    await expect(
      executeJS('return 1;', {
        data: { node: global }
      })
    ).rejects.toThrow(/Invalid execution data/i);
    expect(sanitizeHelper.sandbox).toBe(null);
  });

  test('rejects host capability results that cannot be serialized', async () => {
    await expect(
      executeJS('return await game.leak();', {
        capabilities: {
          game: {
            leak: async () => global
          }
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

  test('enforces maxMessages', async () => {
    let n = 0;
    await expect(
      executeJS(
        `
        await game.ping();
        await game.ping();
        await game.ping();
        return 1;
        `,
        {
          capabilities: {
            game: {
              ping: async () => {
                n += 1;
                return n;
              }
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
});
