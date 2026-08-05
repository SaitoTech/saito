/** @jest-environment jsdom */

jest.mock('../../../lib/saito/ui/saito-image-overlay/saito-image-overlay', () =>
  jest.fn().mockImplementation(() => ({ render: jest.fn() }))
);
jest.mock('../../../lib/templates/modtemplate', () => class ModTemplate {});
jest.mock('../../../lib/saito/ui/saito-header/saito-header', () => jest.fn());
jest.mock('../../../lib/saito/transaction', () => ({ default: jest.fn() }));
jest.mock('./main', () => jest.fn());
jest.mock('./tweet', () => jest.fn());
jest.mock('./tweets', () => jest.fn());
jest.mock('./notifications', () => jest.fn());
jest.mock('./ui/overlays/compose', () => jest.fn());
jest.mock('./ui/overlays/tweet-menu', () => jest.fn());
jest.mock('./ui/overlays/settings', () => jest.fn());
jest.mock('./splash.template', () => jest.fn());
jest.mock('../index', () => jest.fn());

export {};

const Manager = require('./manager');
const RedSquare = require('../redsquare');

function loadTweets(mod, direction) {
  return new Promise((resolve) => mod.loadTransactions('tweets', direction, resolve));
}

describe('RedSquare timeline archive loading', () => {
  test('hydrates from creation order and advances the older-page cursor', async () => {
    const initialCursor = 10_000;
    const transactions = [
      { signature: 'newest', timestamp: 9_000, optional: { updated_at: 9_500 } },
      { signature: 'oldest-page-item', timestamp: 8_000, optional: { updated_at: 8_500 } }
    ];
    const loadTransactions = jest
      .fn()
      .mockImplementationOnce((query, callback) => callback(transactions))
      .mockImplementationOnce((query, callback) => callback([]));
    const peer = {
      peer: 'localhost',
      publicKey: 'viewer',
      tweets_earliest_ts: initialCursor,
      tweets_latest_ts: 0,
      tweets_limit: 10,
      busy: {}
    };
    const mod = Object.create(RedSquare.prototype);

    Object.assign(mod, {
      app: { BROWSER: false, storage: { loadTransactions } },
      publicKey: 'viewer',
      peers: [peer],
      tweets_timeline: [],
      tweets_earliest_ts: initialCursor,
      tweets_latest_ts: 0,
      _load_busy: {},
      hasTweet: jest.fn(() => false),
      addTweet: jest.fn((tx) => ({ signature: tx.signature, created_at: tx.timestamp })),
      getTweet: jest.fn()
    });

    await loadTweets(mod, 'newer');

    expect(loadTransactions.mock.calls[0][0]).toEqual(
      expect.objectContaining({ created_earlier_than: initialCursor, limit: 10 })
    );
    expect(loadTransactions.mock.calls[0][0]).not.toHaveProperty('updated_later_than');
    expect(peer.tweets_earliest_ts).toBe(8_000);
    expect(peer.tweets_latest_ts).toBe(9_500);

    await loadTweets(mod, 'older');
    expect(loadTransactions.mock.calls[1][0]).toEqual(
      expect.objectContaining({ created_earlier_than: 8_000, limit: 10 })
    );
  });

  test('does not mark duplicate-only archive pages as exhausted', () => {
    const manager = new Manager({}, {});
    manager.syncFeedStatus = jest.fn();
    manager.isNearBottom = jest.fn(() => true);

    expect(manager.applyOlderLoadResult({ added: [], exhausted: false })).toBe(true);
    expect(manager.pagination.timeline.exhausted).toBe(false);

    expect(manager.applyOlderLoadResult({ added: [], exhausted: true })).toBe(false);
    expect(manager.pagination.timeline.exhausted).toBe(true);
  });

  test('continues hydration when an archive page contains only replies', () => {
    document.body.innerHTML = '<div id="manager"><div class="list" data-panel="timeline"></div></div>';
    const reply = { signature: 'reply', parent_id: 'root', created_at: 9_000 };
    const manager = new Manager({}, { getTweet: jest.fn(() => reply) }, '#manager');
    manager.timeline_rendered = true;
    manager.isNearBottom = jest.fn(() => true);
    manager.loadMoreIfNeeded = jest.fn();

    manager.handleNewerTweets({ added: ['reply'] });

    expect(manager.loadMoreIfNeeded).toHaveBeenCalledTimes(1);
  });
});
