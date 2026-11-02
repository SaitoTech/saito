const { sanitizeJS } = require('../../../lib/helpers/sanitize');
const Browser = require('../../../lib/saito/browser').default;

const gamePolicy = {
  allowedObjects: ['game'],
  allowedMethods: {
    game: ['addInfluence', 'removeInfluence', 'moveRobber']
  }
};

function expectSafe(source, policy = gamePolicy) {
  const result = sanitizeJS(source, policy);
  expect(result.errors).toEqual([]);
  expect(result.safe).toBe(true);
  return result;
}

function expectUnsafe(source, policy = gamePolicy, errorType = null) {
  const result = sanitizeJS(source, policy);
  expect(result.safe).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
  if (errorType) {
    expect(result.errors.some((e) => e.type === errorType)).toBe(true);
  }
  return result;
}

describe('sanitizeJS', () => {
  describe('permitted code', () => {
    test('allows local variables and arithmetic', () => {
      expectSafe(`
        const a = 1;
        let b = 2;
        const c = a + b * 3;
      `);
    });

    test('allows local functions and calls', () => {
      expectSafe(`
        function double(n) {
          return n + n;
        }
        const x = double(2);
      `);
    });

    test('allows arrays and object literals', () => {
      expectSafe(`
        const arr = [1, 2, 3];
        const obj = { country: "poland", amount: 1 };
        const n = arr[0];
        const c = obj.country;
      `);
    });

    test('allows conditionals', () => {
      expectSafe(`
        const x = 1;
        if (x > 0) {
          const y = x;
        } else {
          const z = 0;
        }
        const t = x ? 1 : 0;
      `);
    });

    test('allows loops when permitted', () => {
      expectSafe(`
        let total = 0;
        for (let i = 0; i < 3; i = i + 1) {
          total = total + i;
        }
        while (total > 0) {
          total = total - 1;
        }
      `);
    });

    test('allows authorized game method calls', () => {
      expectSafe(`
        game.addInfluence("ussr", "poland", 1);
        game.removeInfluence("usa", "iran", 1);
      `);
    });

    test('allows functions containing multiple authorized game operations', () => {
      expectSafe(`
        function playCard() {
          game.addInfluence("ussr", "poland", 1);
          game.removeInfluence("usa", "wgermany", 1);
          game.moveRobber("italy");
        }
        playCard();
      `);
    });

    test('allows aliasing an authorized object and calling methods on the alias', () => {
      expectSafe(`
        const g = game;
        g.addInfluence("ussr", "poland", 1);
      `);
    });

    test('allows static string bracket access for authorized methods', () => {
      expectSafe(`
        game["addInfluence"]("ussr", "poland", 1);
      `);
    });

    test('allows arrow functions that call authorized methods', () => {
      expectSafe(`
        const run = () => {
          game.addInfluence("ussr", "poland", 1);
        };
        run();
      `);
    });
  });

  describe('rejected code', () => {
    test('rejects window', () => {
      expectUnsafe('window.alert(1)', gamePolicy, 'unauthorized_access');
    });

    test('rejects globalThis', () => {
      expectUnsafe('globalThis.game', gamePolicy, 'unauthorized_access');
    });

    test('rejects document', () => {
      expectUnsafe('document.body', gamePolicy, 'unauthorized_access');
    });

    test('rejects localStorage', () => {
      expectUnsafe('localStorage.setItem("a", "b")', gamePolicy, 'unauthorized_access');
    });

    test('rejects sessionStorage and indexedDB', () => {
      expectUnsafe('sessionStorage.clear()', gamePolicy, 'unauthorized_access');
      expectUnsafe('indexedDB.open("db")', gamePolicy, 'unauthorized_access');
    });

    test('rejects app.wallet and other unauthorized objects', () => {
      expectUnsafe('app.wallet', gamePolicy, 'unauthorized_access');
    });

    test('rejects game.constructor and prototype access', () => {
      expectUnsafe('game.constructor', gamePolicy, 'unauthorized_access');
      expectUnsafe('game.prototype', gamePolicy, 'unauthorized_access');
      expectUnsafe('game.__proto__', gamePolicy, 'unauthorized_access');
    });

    test('rejects game["constructor"] bracket access', () => {
      expectUnsafe('game["constructor"]', gamePolicy, 'unauthorized_access');
    });

    test('rejects chaining through authorized methods', () => {
      expectUnsafe('game.addInfluence.constructor', gamePolicy, 'unauthorized_access');
    });

    test('rejects eval and Function', () => {
      expectUnsafe('eval("1+1")', gamePolicy, 'dynamic_execution');
      expectUnsafe('Function("return 1")()', gamePolicy, 'dynamic_execution');
    });

    test('rejects dynamic import', () => {
      expectUnsafe('import("fs")', gamePolicy, 'unauthorized_import');
    });

    test('rejects prototype manipulation patterns', () => {
      expectUnsafe('const o = {}; o.__proto__.x = 1', gamePolicy, 'unauthorized_access');
    });

    test('rejects unauthorized method calls', () => {
      expectUnsafe('game.launchNukes()', gamePolicy, 'unauthorized_access');
    });

    test('rejects unauthorized global references', () => {
      expectUnsafe('process.exit(1)', gamePolicy, 'unauthorized_access');
      expectUnsafe('require("fs")', gamePolicy, 'unauthorized_access');
      expectUnsafe('fetch("https://example.com")', gamePolicy, 'unauthorized_access');
    });

    test('rejects computed property access via expressions', () => {
      expectUnsafe(`
        const key = "addInfluence";
        game[key]("ussr", "poland", 1);
      `, gamePolicy, 'unauthorized_access');
    });

    test('rejects dynamically constructed prohibited property names', () => {
      expectUnsafe(`
        const a = "con";
        const b = "structor";
        game[a + b];
      `, gamePolicy, 'unauthorized_access');
    });

    test('rejects destructuring authorized methods', () => {
      expectUnsafe(`
        const { addInfluence } = game;
        addInfluence("ussr", "poland", 1);
      `, gamePolicy, 'unauthorized_access');
    });

    test('rejects aliasing then accessing constructor', () => {
      expectUnsafe(`
        const g = game;
        g.constructor;
      `, gamePolicy, 'unauthorized_access');
    });

    test('rejects storing authorized method references', () => {
      expectUnsafe(`
        const fn = game.addInfluence;
        fn("ussr", "poland", 1);
      `, gamePolicy, 'unauthorized_access');
    });

    test('rejects network and event APIs', () => {
      expectUnsafe('new XMLHttpRequest()', gamePolicy);
      expectUnsafe('WebSocket', gamePolicy, 'unauthorized_access');
      expectUnsafe('game.addEventListener("click", () => {})', gamePolicy, 'unauthorized_access');
    });

    test('rejects unsupported syntax such as classes and new', () => {
      expectUnsafe('class Foo {}', {}, 'unsupported_syntax');
      expectUnsafe('const x = new Date()', gamePolicy, 'unsupported_syntax');
      expectUnsafe('async function f() { await 1; }', gamePolicy);
    });

    test('rejects invalid JavaScript', () => {
      expectUnsafe('function (', {}, 'parse_error');
    });

    test('rejects loops when loops are not in allowedSyntax', () => {
      expectUnsafe(
        'while (true) {}',
        {
          allowedSyntax: ['variables', 'blocks', 'literals']
        },
        'unsupported_syntax'
      );
    });

    test('never returns safe true when errors exist', () => {
      const result = sanitizeJS('window', gamePolicy);
      expect(result.safe).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Browser.sanitizeJS integration', () => {
    test('exposes sanitizeJS on Browser', () => {
      const browser = new Browser({});
      const result = browser.sanitizeJS('const x = 1;', gamePolicy);
      expect(result.safe).toBe(true);
      expect(browser.sanitizeJS('eval(1)', gamePolicy).safe).toBe(false);
    });
  });
});
