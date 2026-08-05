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
const Profile = require('./profile');
const RedSquare = require('../redsquare');

describe('RedSquare user profile routing', () => {
  const publicKey = '4NnLruCcmkPwxCXQFumKJuQ7jT9gC1eL8G6uSzB2oVfH';

  function makeModule() {
    const mod = Object.create(RedSquare.prototype);
    mod.slug = 'redsquare';
    mod.publicKey = publicKey;
    mod.returnSlug = () => mod.slug;
    return mod;
  }

  test('uses the canonical user path and accepts legacy locations', () => {
    const mod = makeModule();

    expect(mod.returnUserUrl(publicKey)).toBe(
      `${window.location.origin}/redsquare/user/${publicKey}`
    );
    expect(
      mod.returnUserPublicKeyFromLocation({
        pathname: `/redsquare/user/${publicKey}`,
        search: '',
        hash: ''
      })
    ).toBe(publicKey);
    expect(
      mod.returnUserPublicKeyFromLocation({
        pathname: '/redsquare/',
        search: `?user_id=${publicKey}`,
        hash: ''
      })
    ).toBe(publicKey);
    expect(
      mod.returnUserPublicKeyFromLocation({ pathname: '/redsquare/', search: '', hash: '#profile' })
    ).toBe(publicKey);
  });

  test('canonicalizes a legacy profile route before rendering it', async () => {
    const mod = makeModule();
    mod.returnTweetSignatureFromLocation = jest.fn(() => '');
    mod.returnUserPublicKeyFromLocation = jest.fn(() => publicKey);
    const manager = new Manager(
      {
        crypto: { isPublicKey: jest.fn(() => true) },
        browser: {},
        modules: {}
      },
      mod
    );
    const render = jest.spyOn(manager, 'renderProfileView').mockImplementation(() => {});

    window.history.replaceState({}, '', `/redsquare/?user_id=${publicKey}`);
    await manager.applyLocationRoute();

    expect(window.location.pathname).toBe(`/redsquare/user/${publicKey}`);
    expect(render).toHaveBeenCalledWith('posts', publicKey, { updateHistory: false });
  });

  test('permanently redirects legacy server links to the canonical user path', () => {
    const mod = makeModule();
    const routes = {};
    const expressapp = {
      use: jest.fn(),
      get: jest.fn((path, handler) => {
        routes[path] = handler;
      })
    };
    const express = { static: jest.fn(() => jest.fn()) };
    const res = { redirect: jest.fn() };

    mod.webServer({ build_number: 1 }, expressapp, express);
    routes['/redsquare']({ query: { user_id: publicKey } }, res);

    expect(res.redirect).toHaveBeenCalledWith(301, `/redsquare/user/${publicKey}`);
  });

  test('does not leak the viewer profile into another user profile', () => {
    const targetKey = 'target-key';
    const mod: any = {
      publicKey,
      profile: { bio: 'private local bio', banner: 'private local banner' },
      enable_profile_edits: true
    };
    const profile = new Profile(
      {
        keychain: {
          returnIdenticon: jest.fn(() => 'target-avatar'),
          returnUsername: jest.fn(() => 'Target')
        },
        modules: { returnModule: jest.fn(() => ({})) }
      },
      mod
    );

    expect(profile.buildProfileData(targetKey)).toEqual(
      expect.objectContaining({
        publicKey: targetKey,
        bio: '',
        banner: '',
        can_edit: false
      })
    );
  });
});

describe('RedSquare profile archive isolation', () => {
  test('loads author posts without inserting them into the home timeline', async () => {
    const publicKey = 'profile-key';
    const timeline = ['home-tweet'];
    const profileTweet = {
      signature: 'profile-tweet',
      publicKey,
      parent_id: '',
      created_at: 100
    };
    const archiveTx = { timestamp: 100 };
    const loadArchiveTransactions = jest.fn(async () => [archiveTx]);
    const mod: any = {
      name: 'RedSquare',
      publicKey: 'viewer-key',
      tweets: {},
      profile_tweets: { 'profile-tweet': profileTweet },
      tweets_timeline: timeline,
      returnTweetArchivePeers: jest.fn(() => ['localhost']),
      loadArchiveTransactions,
      cacheProfileTweetTransactions: jest.fn(async () => [profileTweet]),
      getTweet(signature) {
        return this.tweets[signature] || this.profile_tweets[signature] || null;
      }
    };
    const manager = new Manager(
      {
        browser: {},
        modules: {
          moderateAddress: jest.fn(() => 0),
          moderate: jest.fn(() => 0)
        }
      },
      mod
    );
    manager.mode = 'posts';
    manager.active_profile_key = publicKey;

    await manager.loadProfileArchivePage();

    expect(loadArchiveTransactions).toHaveBeenCalledWith(
      expect.objectContaining({
        field1: 'RedSquare',
        field2: publicKey,
        flagged: 0,
        limit: 20
      }),
      'localhost'
    );
    expect(manager.collectProfileTweets()).toEqual([profileTweet]);
    expect(timeline).toEqual(['home-tweet']);
  });

  test('does not query or display a blocked profile', async () => {
    const loadArchiveTransactions = jest.fn();
    const mod: any = {
      publicKey: 'viewer-key',
      tweets: {},
      returnTweetArchivePeers: jest.fn(() => ['localhost']),
      loadArchiveTransactions,
      getTweet: jest.fn()
    };
    const manager = new Manager(
      {
        browser: {},
        modules: { moderateAddress: jest.fn(() => -1) }
      },
      mod
    );
    manager.mode = 'posts';
    manager.active_profile_key = 'blocked-key';

    await manager.loadProfileArchivePage();

    expect(loadArchiveTransactions).not.toHaveBeenCalled();
    expect(manager.collectProfileTweets()).toEqual([]);
  });
});
