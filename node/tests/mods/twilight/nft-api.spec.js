/**
 * Twilight NFT API: addToQueue policy, place applyLocal, and read helpers.
 */

const nftApi = require('../../../mods/twilight/lib/core/api');
const twilightPolicy = require('../../../mods/twilight/lib/core/queue-policy');
const {
  createEngineNftQueuePolicy,
  mergeNftQueuePolicies,
  addToQueue,
  HARD_BLOCKED_COMMANDS,
  assertValidNftCardId
} = require('../../../lib/templates/gametemplate-src/gametemplate-nft-queue');

function bindApi(host, methods) {
  const out = {};
  for (const [name, fn] of Object.entries(methods)) {
    out[name] = fn.bind(host);
  }
  return out;
}

function makeTwilightHost(overrides = {}) {
  const host = {
    moves: [],
    roles: ['observer', 'ussr', 'us'],
    game: { player: 2 },
    countries: {
      egypt: { name: 'Egypt', us: 0, ussr: 0, control: 2 },
      canada: { name: 'Canada', us: 2, ussr: 0, control: 2 }
    },
    placeInfluenceCalls: [],
    placeInfluence(country, amount, faction) {
      this.placeInfluenceCalls.push([country, amount, faction]);
      this.countries[country][faction] += amount;
    },
    showMinimapMarker() {},
    addMove(mv) {
      this.moves.push(mv);
    },
    returnNftQueuePolicy() {
      return mergeNftQueuePolicies(createEngineNftQueuePolicy(), twilightPolicy);
    },
    isControlled: function (faction, country) {
      const c = this.countries[country];
      if (!c) return 0;
      const lead =
        faction === 'us' ? c.us - c.ussr : faction === 'ussr' ? c.ussr - c.us : 0;
      return c.control <= lead ? 1 : 0;
    },
    whoControls: function (country) {
      const c = this.countries[country];
      if (!c) return '';
      if (c.ussr - c.us >= c.control) return 'ussr';
      if (c.us - c.ussr >= c.control) return 'us';
      return '';
    },
    ...overrides
  };
  host.game.state = host.game.state || { events: { reformer: 1 } };
  return host;
}

describe('NFT addToQueue policy', () => {
  test('accepts place, applies local influence once, forces acting origin', () => {
    const host = makeTwilightHost();
    const normalized = addToQueue(host, 'place\tus\tus\tegypt\t2');
    expect(normalized).toBe('place\tus\tus\tegypt\t2');
    expect(host.placeInfluenceCalls).toEqual([['egypt', 2, 'us']]);
    expect(host.countries.egypt.us).toBe(2);
    expect(host.moves).toEqual(['place\tus\tus\tegypt\t2']);
  });

  test('rewrites origin to acting faction (USSR player)', () => {
    const host = makeTwilightHost({ game: { player: 1, state: { events: {} } } });
    const normalized = addToQueue(host, 'place\tus\tussr\tegypt\t2');
    expect(normalized).toBe('place\tussr\tussr\tegypt\t2');
    expect(host.placeInfluenceCalls).toEqual([['egypt', 2, 'ussr']]);
  });

  test('rejects prohibited payment/wallet commands', () => {
    const host = makeTwilightHost();
    for (const cmd of ['SEND', 'RECEIVE', 'SETTLE', 'CRYPTOKEY', 'GAMEOVER']) {
      expect(() => addToQueue(host, `${cmd}\tx`)).toThrow(/not permitted/);
    }
    expect(HARD_BLOCKED_COMMANDS.has('SEND')).toBe(true);
  });

  test('rejects unknown commands and bad place args', () => {
    const host = makeTwilightHost();
    expect(() => addToQueue(host, 'coup\tus\tegypt')).toThrow(/not permitted/);
    expect(() => addToQueue(host, 'place\tus\tus\tnarnia\t2')).toThrow(/unknown country/);
    expect(() => addToQueue(host, 'place\tus\tus\tegypt\t0')).toThrow(/positive integer/);
    expect(() => addToQueue(host, 'place\tus\tus\tegypt')).toThrow(/expected/);
  });

  test('accepts resolve and NOTIFY', () => {
    const host = makeTwilightHost();
    expect(addToQueue(host, 'resolve\tnft-test-title-105')).toBe('resolve\tnft-test-title-105');
    expect(addToQueue(host, 'NOTIFY\thello')).toBe('NOTIFY\thello');
    expect(host.moves).toEqual(['resolve\tnft-test-title-105', 'NOTIFY\thello']);
  });

  test('games cannot enable hard-blocked commands via policy merge', () => {
    expect(() =>
      mergeNftQueuePolicies(createEngineNftQueuePolicy(), {
        SEND: { validate: () => 'SEND' }
      })
    ).toThrow(/blocked command/);
  });
});

describe('NFT card id validation', () => {
  test('rejects control characters and reserved names', () => {
    expect(() => assertValidNftCardId('a\tb')).toThrow(/tab/);
    expect(() => assertValidNftCardId('SEND')).toThrow(/reserved/);
    expect(assertValidNftCardId('nft-test-title-105')).toBe('nft-test-title-105');
  });
});

describe('Twilight NFT read/select API', () => {
  test('read-only queries do not mutate state', () => {
    const host = makeTwilightHost();
    const before = JSON.stringify(host.game.state);
    const api = bindApi(host, nftApi);
    expect(api.isControlled('us', 'canada')).toBe(1);
    expect(api.whoControls('canada')).toBe('us');
    expect(api.isEventActive('reformer')).toBe(1);
    expect(JSON.stringify(host.game.state)).toBe(before);
  });

  test('playerSelectOption uses HUD only', async () => {
    const host = makeTwilightHost({
      hud: {
        updateMenu(options, callback) {
          if (!options || !options.length) return;
          callback('india');
        }
      }
    });
    const api = bindApi(host, nftApi);
    await expect(
      api.playerSelectOption([
        { id: 'india', label: 'India' },
        { id: 'pakistan', label: 'Pakistan' }
      ])
    ).resolves.toBe('india');
    expect(host.moves).toEqual([]);
  });
});
