const { sanitizeJS } = require('../../../lib/helpers/sanitize');
const Browser = require('../../../lib/saito/browser').default;

const apiPolicy = {
  allowedObjects: ['api'],
  allowedMethods: {
    api: ['addInfluence', 'removeInfluence', 'moveRobber']
  }
};

function expectSafe(source, policy = apiPolicy) {
  const result = sanitizeJS(source, policy);
  expect(result.errors).toEqual([]);
  expect(result.safe).toBe(true);
  return result;
}

function expectUnsafe(source, policy = apiPolicy, errorType = null) {
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

    test('allows authorized api method calls', () => {
      expectSafe(`
        api.addInfluence("ussr", "poland", 1);
        api.removeInfluence("usa", "iran", 1);
      `);
    });

    test('allows functions containing multiple authorized api operations', () => {
      expectSafe(`
        function playCard() {
          api.addInfluence("ussr", "poland", 1);
          api.removeInfluence("usa", "wgermany", 1);
          api.moveRobber("italy");
        }
        playCard();
      `);
    });

    test('allows aliasing an authorized object and calling methods on the alias', () => {
      expectSafe(`
        const g = api;
        g.addInfluence("ussr", "poland", 1);
      `);
    });

    test('allows static string bracket access for authorized methods', () => {
      expectSafe(`
        api["addInfluence"]("ussr", "poland", 1);
      `);
    });

    test('allows arrow functions that call authorized methods', () => {
      expectSafe(`
        const run = () => {
          api.addInfluence("ussr", "poland", 1);
        };
        run();
      `);
    });
  });

  describe('rejected code', () => {
    test('rejects window', () => {
      expectUnsafe('window.alert(1)', apiPolicy, 'unauthorized_access');
    });

    test('rejects globalThis', () => {
      expectUnsafe('globalThis.api', apiPolicy, 'unauthorized_access');
    });

    test('rejects document', () => {
      expectUnsafe('document.body', apiPolicy, 'unauthorized_access');
    });

    test('rejects localStorage', () => {
      expectUnsafe('localStorage.setItem("a", "b")', apiPolicy, 'unauthorized_access');
    });

    test('rejects sessionStorage and indexedDB', () => {
      expectUnsafe('sessionStorage.clear()', apiPolicy, 'unauthorized_access');
      expectUnsafe('indexedDB.open("db")', apiPolicy, 'unauthorized_access');
    });

    test('rejects app.wallet and other unauthorized objects', () => {
      expectUnsafe('app.wallet', apiPolicy, 'unauthorized_access');
    });

    test('rejects api.constructor and prototype access', () => {
      expectUnsafe('api.constructor', apiPolicy, 'unauthorized_access');
      expectUnsafe('api.prototype', apiPolicy, 'unauthorized_access');
      expectUnsafe('api.__proto__', apiPolicy, 'unauthorized_access');
    });

    test('rejects api["constructor"] bracket access', () => {
      expectUnsafe('api["constructor"]', apiPolicy, 'unauthorized_access');
    });

    test('rejects chaining through authorized methods', () => {
      expectUnsafe('api.addInfluence.constructor', apiPolicy, 'unauthorized_access');
    });

    test('rejects eval and Function', () => {
      expectUnsafe('eval("1+1")', apiPolicy, 'dynamic_execution');
      expectUnsafe('Function("return 1")()', apiPolicy, 'dynamic_execution');
    });

    test('rejects dynamic import', () => {
      expectUnsafe('import("fs")', apiPolicy, 'unauthorized_import');
    });

    test('rejects prototype manipulation patterns', () => {
      expectUnsafe('const o = {}; o.__proto__.x = 1', apiPolicy, 'unauthorized_access');
    });

    test('rejects unauthorized method calls', () => {
      expectUnsafe('api.launchNukes()', apiPolicy, 'unauthorized_access');
    });

    test('rejects unauthorized global references', () => {
      expectUnsafe('process.exit(1)', apiPolicy, 'unauthorized_access');
      expectUnsafe('require("fs")', apiPolicy, 'unauthorized_access');
      expectUnsafe('fetch("https://example.com")', apiPolicy, 'unauthorized_access');
    });

    test('allows computed property access on local data and api calls', () => {
      expectSafe(`
        const key = "addInfluence";
        const board = { egypt: 1 };
        const id = "egypt";
        const n = board[id];
        api[key]("ussr", "poland", 1);
      `);
    });

    test('allows a dynamically constructed property read', () => {
      expectSafe(`
        const a = "con";
        const b = "structor";
        const obj = { label: 1 };
        const n = obj[a + b];
      `);
    });

    test('rejects destructuring authorized methods', () => {
      expectUnsafe(`
        const { addInfluence } = api;
        addInfluence("ussr", "poland", 1);
      `, apiPolicy, 'unauthorized_access');
    });

    test('rejects aliasing then accessing constructor', () => {
      expectUnsafe(`
        const g = api;
        g.constructor;
      `, apiPolicy, 'unauthorized_access');
    });

    test('rejects storing authorized method references', () => {
      expectUnsafe(`
        const fn = api.addInfluence;
        fn("ussr", "poland", 1);
      `, apiPolicy, 'unauthorized_access');
    });

    test('rejects network and event APIs', () => {
      expectUnsafe('new XMLHttpRequest()', apiPolicy);
      expectUnsafe('WebSocket', apiPolicy, 'unauthorized_access');
      expectUnsafe('api.addEventListener("click", () => {})', apiPolicy, 'unauthorized_access');
    });

    test('rejects await when async is not enabled', () => {
      expectUnsafe('async function f() { await 1; }', apiPolicy);
    });

    test('rejects host constructors', () => {
      expectUnsafe('const x = new Date()', apiPolicy, 'unauthorized_access');
      expectUnsafe('const x = new Function("return 1")', apiPolicy, 'dynamic_execution');
      expectUnsafe('const x = new Worker("worker.js")', apiPolicy, 'unauthorized_access');
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
      const result = sanitizeJS('window', apiPolicy);
      expect(result.safe).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Browser.sanitizeJS integration', () => {
    test('exposes sanitizeJS on Browser', () => {
      const browser = new Browser({});
      const result = browser.sanitizeJS('const x = 1;', apiPolicy);
      expect(result.safe).toBe(true);
      expect(browser.sanitizeJS('eval(1)', apiPolicy).safe).toBe(false);
    });
  });

  describe('read-only context data', () => {
    const nftPolicy = {
      allowedObjects: ['api'],
      allowedMethods: {
        api: [
          'playerSelectOption',
          'playerSelectCountry',
          'isControlled',
          'whoControls',
          'isEventActive',
          'addToQueue',
          'endTurn'
        ]
      },
      contextData: ['context'],
      allowAsync: true
    };

    test('allows top-level context data reads', () => {
      expectSafe(`const c = context; const g = context.game;`, nftPolicy);
    });

    test('allows nested object and array property reads', () => {
      expectSafe(
        `
        const id = context.game.options.nfts[0].id;
        const player = context.game.player;
        const round = context.game.state.round;
        const defcon = context.game.state.defcon;
        const canada = context.game.countries.canada.us;
        const first = context.game.queue[0];
        `,
        nftPolicy
      );
    });

    test('allows reading context.game fields in expressions', () => {
      expectSafe(
        `
        api.addToQueue("resolve\\t" + context.game.options.nfts[0].id);
        const x = context.game.state.round + context.game.state.defcon;
        `,
        nftPolicy
      );
    });

    test('allows the Test NFT move sequence with context.game', () => {
      // executeJS wraps user source in an async function before sanitizeJS;
      // mirror that so top-level await is valid under allowAsync.
      expectSafe(
        `async function __saito_exec__() {
        api.addToQueue("place\\tus\\tus\\tegypt\\t2");
        api.addToQueue("resolve\\tnft-test-title-105");
        await api.endTurn();
        }`,
        nftPolicy
      );
    });

    test('allows awaited player selection helpers', () => {
      expectSafe(
        `async function __saito_exec__() {
        const opt = await api.playerSelectOption([{ id: "a", label: "A" }]);
        const country = await api.playerSelectCountry(["canada", "uk"]);
        api.addToQueue("NOTIFY\\t" + opt + " " + country);
        await api.endTurn();
        }`,
        nftPolicy
      );
    });

    test('rejects assignment to top-level context data', () => {
      expectUnsafe(`context = {};`, nftPolicy, 'unauthorized_access');
    });

    test('rejects assignment to nested context data properties', () => {
      expectUnsafe(`context.game = {};`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`context.game.player = 9;`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`context.game.state.round = 9;`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`context.game.countries.canada.us = 5;`, nftPolicy, 'unauthorized_access');
    });

    test('rejects update expressions on context data', () => {
      expectUnsafe(`context.game.state.round++;`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`++context.game.state.defcon;`, nftPolicy, 'unauthorized_access');
    });

    test('rejects array mutation and other calls through context data', () => {
      expectUnsafe(`context.game.queue.push("x");`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`context.game.queue.splice(0, 1);`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`context.game.player.toString();`, nftPolicy, 'unauthorized_access');
    });

    test('rejects dangerous property access on context data', () => {
      expectUnsafe(`context.constructor;`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`context.game.__proto__;`, nftPolicy, 'unauthorized_access');
    });

    test('still rejects unauthorized capability property access', () => {
      expectUnsafe(`api.launchNukes();`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`api.secret;`, nftPolicy, 'unauthorized_access');
      expectUnsafe(`api.constructor;`, nftPolicy, 'unauthorized_access');
    });

    test('still allows authorized capability calls', () => {
      expectSafe(
        `async function __saito_exec__() {
        api.addToQueue("resolve\\tcia");
        await api.endTurn();
        }`,
        nftPolicy
      );
    });

    test('allows ordinary JavaScript inside the sandbox policy', () => {
      expectSafe(
        `
        function calculateInfluence(country, amount) {
          const base = Number(amount);
          const extra = Math.min(2, parseInt("1", 10));
          return base + extra;
        }
        const board = { egypt: 1, france: 0 };
        const ids = Object.keys(board).filter((id) => board[id] > 0);
        const placed = {};
        for (const id of ids) {
          placed[id] = Math.min(4, board[id] + calculateInfluence(id, "2"));
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
        const sum = ids.map((id) => tally.add(placed[id]));
        const parsed = JSON.parse(JSON.stringify(placed));
        const matched = /eg/.test(ids[0]);
        const listed = "egypt" in board;
        const kind = typeof parsed;
        const report = { sum, matched, listed, kind };
        `,
        { ...apiPolicy, allowAsync: true }
      );
    });

    test('allows async functions when async is enabled', () => {
      expectSafe(
        `
        async function load(n) {
          const value = await Promise.resolve(Number(n));
          return value;
        }
        `,
        { allowAsync: true }
      );
    });

    test('still rejects host, node, network, dynamic code and worker access', () => {
      expectUnsafe('window.alert(1)', apiPolicy, 'unauthorized_access');
      expectUnsafe('document.body', apiPolicy, 'unauthorized_access');
      expectUnsafe('globalThis.api', apiPolicy, 'unauthorized_access');
      expectUnsafe('parent.location', apiPolicy, 'unauthorized_access');
      expectUnsafe('top.location', apiPolicy, 'unauthorized_access');
      expectUnsafe('require("fs")', apiPolicy, 'unauthorized_access');
      expectUnsafe('process.exit(1)', apiPolicy, 'unauthorized_access');
      expectUnsafe('module.exports', apiPolicy, 'unauthorized_access');
      expectUnsafe('fetch("https://example.com")', apiPolicy, 'unauthorized_access');
      expectUnsafe('new XMLHttpRequest()', apiPolicy, 'unauthorized_access');
      expectUnsafe('new WebSocket("wss://example.com")', apiPolicy, 'unauthorized_access');
      expectUnsafe('new EventSource("https://example.com")', apiPolicy, 'unauthorized_access');
      expectUnsafe('eval("1")', apiPolicy, 'dynamic_execution');
      expectUnsafe('Function("return 1")()', apiPolicy, 'dynamic_execution');
      expectUnsafe('import("fs")', apiPolicy, 'unauthorized_import');
      expectUnsafe('new Worker("w.js")', apiPolicy, 'unauthorized_access');
      expectUnsafe('new SharedWorker("w.js")', apiPolicy, 'unauthorized_access');
      expectUnsafe('importScripts("w.js")', apiPolicy, 'unauthorized_access');
      expectUnsafe('localStorage.setItem("a", "b")', apiPolicy, 'unauthorized_access');
      expectUnsafe('indexedDB.open("db")', apiPolicy, 'unauthorized_access');
      expectUnsafe('api.launchNukes()', apiPolicy, 'unauthorized_access');
      expectUnsafe('api["constructor"]', apiPolicy, 'unauthorized_access');
    });

    test('plain allowedGlobals still cannot be property-accessed', () => {
      expectUnsafe(
        `phase.detail;`,
        {
          allowedGlobals: ['phase'],
          allowedObjects: ['api'],
          allowedMethods: { api: ['addMove'] }
        },
        'unauthorized_access'
      );
    });
  });
});
