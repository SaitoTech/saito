jest.mock('../../../lib/helpers/sandbox-browser', () =>
  require('../../../lib/helpers/sandbox-server')
);

const sanitizeHelper = require('../../../lib/helpers/sanitize');
const {
  findNftByAppId,
  resolveNftEventCode,
  applyNftEventArgs,
  parseNftEventFields,
  runNftEvent
} = require('../../../lib/templates/gametemplate-src/gametemplate-nft-queue');

afterEach(() => {
  if (sanitizeHelper.sandbox) {
    sanitizeHelper.sandbox.terminate();
    sanitizeHelper.sandbox = null;
  }
});

describe('findNftByAppId', () => {
  test('locates an object by application-level id', () => {
    const nfts = [
      { id: 'card-a', data: { code: 'a();' } },
      { id: 'card-b', data: { code: 'b();' } }
    ];
    expect(findNftByAppId(nfts, 'card-b')).toBe(nfts[1]);
    expect(findNftByAppId(nfts, 'missing')).toBeNull();
    expect(findNftByAppId(null, 'card-a')).toBeNull();
  });
});

describe('resolveNftEventCode', () => {
  test('executes a single-string code representation at index 0', () => {
    expect(resolveNftEventCode('return 1;', 0)).toEqual({ ok: true, code: 'return 1;' });
  });

  test('rejects non-zero index for string code', () => {
    expect(resolveNftEventCode('return 1;', 1).ok).toBe(false);
  });

  test('selects code by index from a string array', () => {
    const code = ['zero();', 'one();', 'two();'];
    expect(resolveNftEventCode(code, 1)).toEqual({ ok: true, code: 'one();' });
  });

  test('selects legacy { code } array entries by index', () => {
    const code = [{ name: 'a', code: 'first();' }, { name: 'b', code: 'second();' }];
    expect(resolveNftEventCode(code, 1)).toEqual({ ok: true, code: 'second();' });
  });

  test('handles missing or invalid indices safely', () => {
    expect(resolveNftEventCode(['a();'], 3).ok).toBe(false);
    expect(resolveNftEventCode(['a();'], -1).ok).toBe(false);
    expect(resolveNftEventCode(null, 0).ok).toBe(false);
    expect(resolveNftEventCode([''], 0).ok).toBe(false);
  });
});

describe('applyNftEventArgs', () => {
  test('creates a fresh args array and preserves order', () => {
    const nft = { id: 'x', args: ['old'] };
    const first = applyNftEventArgs(nft, ['a', 'b', 'c']);
    expect(first).toEqual(['a', 'b', 'c']);
    expect(nft.args).toBe(first);
    expect(nft.args).not.toContain('old');

    const second = applyNftEventArgs(nft, ['z']);
    expect(second).toEqual(['z']);
    expect(nft.args).toBe(second);
    expect(second).not.toBe(first);
  });

  test('supports zero arguments', () => {
    const nft = { id: 'x', args: ['stale'] };
    applyNftEventArgs(nft, []);
    expect(nft.args).toEqual([]);
  });
});

describe('parseNftEventFields', () => {
  test('parses id, index, and trailing args', () => {
    expect(parseNftEventFields(['NFT_EVENT', 'card-1', '2', 'x', 'y'])).toEqual({
      ok: true,
      id: 'card-1',
      index: 2,
      argFields: ['x', 'y']
    });
  });

  test('rejects missing id or non-integer index', () => {
    expect(parseNftEventFields(['NFT_EVENT', '', '0']).ok).toBe(false);
    expect(parseNftEventFields(['NFT_EVENT', 'card-1', '1.5']).ok).toBe(false);
    expect(parseNftEventFields(['NFT_EVENT', 'card-1', 'abc']).ok).toBe(false);
  });
});

describe('runNftEvent', () => {
  function makeGameSelf(nfts, executeJS) {
    return {
      game: { options: { nfts } },
      app: {
        BROWSER: 1,
        browser: { executeJS }
      },
      returnApi() {
        return {};
      },
      returnContext() {
        return { game: { player: 1 } };
      }
    };
  }

  test('executes locally imported options.nfts data through the sandbox', async () => {
    const nft = {
      id: 'local-card',
      data: { code: 'return args[0] + ":" + args[1];' }
    };
    const game_self = makeGameSelf([nft], sanitizeHelper.executeJS.bind(sanitizeHelper));
    const result = await runNftEvent(game_self, [
      'NFT_EVENT',
      'local-card',
      '0',
      'alpha',
      'beta'
    ]);
    expect(result).toBe(1);
    expect(nft.args).toEqual(['alpha', 'beta']);
  });

  test('returns 0 when the script returns 0', async () => {
    const nft = { id: 'pause-card', data: { code: 'return 0;' } };
    const game_self = makeGameSelf([nft], sanitizeHelper.executeJS.bind(sanitizeHelper));
    const result = await runNftEvent(game_self, ['NFT_EVENT', 'pause-card', '0']);
    expect(result).toBe(0);
  });

  test('returns 1 for missing nft or invalid index', async () => {
    const nft = { id: 'card', data: { code: ['only();'] } };
    const game_self = makeGameSelf([nft], async () => 1);
    expect(await runNftEvent(game_self, ['NFT_EVENT', 'missing', '0'])).toBe(1);
    expect(await runNftEvent(game_self, ['NFT_EVENT', 'card', '9'])).toBe(1);
  });

  test('returns 1 when executeJS is unavailable', async () => {
    const nft = { id: 'card', data: { code: 'return 1;' } };
    const game_self = {
      game: { options: { nfts: [nft] } },
      app: { BROWSER: 0 },
      returnApi() {
        return {};
      },
      returnContext() {
        return {};
      }
    };
    expect(await runNftEvent(game_self, ['NFT_EVENT', 'card', '0'])).toBe(1);
  });

  test('does not leak args across invocations', async () => {
    const nft = {
      id: 'card',
      data: { code: 'return args.length;' }
    };
    const game_self = makeGameSelf([nft], sanitizeHelper.executeJS.bind(sanitizeHelper));
    await runNftEvent(game_self, ['NFT_EVENT', 'card', '0', 'one', 'two']);
    expect(nft.args).toEqual(['one', 'two']);
    await runNftEvent(game_self, ['NFT_EVENT', 'card', '0']);
    expect(nft.args).toEqual([]);
  });

  test('selects array index and passes multiple args in order', async () => {
    const nft = {
      id: 'multi',
      data: {
        code: [
          'return "first";',
          'return args[0] + "-" + args[1] + "-" + args[2];'
        ]
      }
    };
    const game_self = makeGameSelf([nft], sanitizeHelper.executeJS.bind(sanitizeHelper));
    const result = await runNftEvent(game_self, [
      'NFT_EVENT',
      'multi',
      '1',
      'a',
      'b',
      'c'
    ]);
    expect(result).toBe(1);
    expect(nft.args).toEqual(['a', 'b', 'c']);
  });
});
