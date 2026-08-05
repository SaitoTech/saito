export {};

const RedSquareApi = require('./redsquare-api');

function makeTweet(signature, threadId, parentId = '') {
  return {
    signature,
    thread_id: threadId,
    parent_id: parentId,
    publicKey: `${signature}-author`,
    tx: {
      signature,
      from: [{ publicKey: `${signature}-author` }],
      to: [{ publicKey: 'thread-participant' }, { publicKey: `${signature}-author` }]
    },
    render: jest.fn()
  };
}

function makeApi(tweets = {}) {
  const app = {
    browser: {
      addStylesheet: jest.fn()
    },
    network: {
      propagateTransaction: jest.fn(async () => {})
    }
  };
  const mod = {
    browser_active: false,
    compose_overlay: { open: jest.fn() },
    manager: null,
    tweets_children: {},
    registerPeer: jest.fn(),
    getTweet: jest.fn((signature) => tweets[signature] || null),
    loadTweetThread: jest.fn(async (signature) => tweets[signature] || null),
    createTweetTransaction: jest.fn(),
    receiveTweetTransaction: jest.fn(),
    returnSlug: jest.fn(() => 'redsquare')
  };

  return { api: new RedSquareApi(app, mod), app, mod };
}

describe('RedSquare module API', () => {
  test('registers an archive peer for consumers used outside RedSquare', () => {
    const { api, mod } = makeApi();
    const peer = { publicKey: 'archive-peer' };

    expect(api.registerPeer(peer)).toBe(true);
    expect(mod.registerPeer).toHaveBeenCalledWith(peer);
  });

  test('publishes an immediate reply with the supplied parent and root', async () => {
    const root = makeTweet('root', 'root');
    const parent = makeTweet('parent', 'root', 'root');
    const { api, app, mod } = makeApi({ root, parent });
    const tx = { signature: 'reply', sign: jest.fn(async () => {}) };
    const renderedReply = { signature: 'reply' };
    mod.createTweetTransaction.mockResolvedValue(tx);
    mod.receiveTweetTransaction.mockResolvedValue(renderedReply);
    mod.manager = { onTweetPosted: jest.fn() };

    await expect(
      api.composeReply({
        root_tx_sig: 'root',
        parent_tx_sig: 'parent',
        text: 'More detail',
        publishImmediately: true
      })
    ).resolves.toBe(tx);

    expect(mod.createTweetTransaction).toHaveBeenCalledWith(
      {
        text: 'More detail',
        parent_id: 'parent',
        thread_id: 'root'
      },
      ['parent-author', 'thread-participant']
    );
    expect(tx.sign).toHaveBeenCalledTimes(1);
    expect(app.network.propagateTransaction).toHaveBeenCalledWith(tx);
    expect(mod.receiveTweetTransaction).toHaveBeenCalledWith(tx);
    expect(mod.manager.onTweetPosted).toHaveBeenCalledWith(renderedReply);
  });

  test('interactive reply resolves once with the transaction returned by the composer', async () => {
    const root = makeTweet('root', 'root');
    const parent = makeTweet('parent', 'root', 'root');
    const { api, mod } = makeApi({ root, parent });
    const pending = api.composeReply({
      root_tx_sig: 'root',
      parent_tx_sig: 'parent',
      text: 'Initial text',
      prompt: 'Reply prompt'
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(mod.compose_overlay.open).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'reply',
        reply_to: parent,
        text: 'Initial text',
        prompt: 'Reply prompt',
        onComplete: expect.any(Function)
      })
    );

    const options = mod.compose_overlay.open.mock.calls[0][0];
    const tx = { signature: 'reply' };
    options.onComplete(tx);
    options.onComplete(null);
    await expect(pending).resolves.toBe(tx);
  });

  test('rejects a source tweet outside the supplied thread', async () => {
    const root = makeTweet('root', 'root');
    const source = makeTweet('source', 'different-root', 'different-parent');
    const { api } = makeApi({ root, source });

    await expect(
      api.resolveTweet({ root_tx_sig: 'root', source_tx_sig: 'source' })
    ).rejects.toThrow('not in the supplied thread');
  });

  test('does not trust a claimed thread id without a parent path to the root', async () => {
    const root = makeTweet('root', 'root');
    const unrelatedParent = makeTweet('unrelated-parent', 'unrelated-parent');
    const source = makeTweet('source', 'root', 'unrelated-parent');
    const { api } = makeApi({ root, source, 'unrelated-parent': unrelatedParent });

    await expect(
      api.resolveTweet({ root_tx_sig: 'root', source_tx_sig: 'source' })
    ).rejects.toThrow('not in the supplied thread');
  });

  test('renders through cached Tweet components and binds existing manager controls', async () => {
    const root = makeTweet('root', 'root');
    const reply = makeTweet('reply', 'root', 'root');
    const { api, app, mod } = makeApi({ root, reply });
    (mod.tweets_children as Record<string, string[]>).root = ['reply'];
    mod.manager = {
      attachTweetNavigation: jest.fn(),
      attachTweetImageViewer: jest.fn(),
      attachThreadContext: jest.fn(),
      attachTweetMenu: jest.fn(),
      attachTweetReply: jest.fn(),
      attachTweetLike: jest.fn(),
      attachTweetRetweet: jest.fn(),
      attachTweetShare: jest.fn()
    };
    const host = { id: 'bug-thread', innerHTML: 'loading', isConnected: true };

    const cleanup = await api.renderThread(host, {
      root_tx_sig: 'root',
      source_tx_sig: 'root',
      reply: true
    });

    expect(root.render).toHaveBeenCalledWith('#bug-thread', {
      focused: true,
      presentation: 'focused'
    });
    expect(reply.render).toHaveBeenCalledWith('#bug-thread', {
      reply: true,
      presentation: 'reply'
    });
    expect(mod.manager.attachTweetReply).toHaveBeenCalledWith(host);
    expect(app.browser.addStylesheet).toHaveBeenCalledWith(
      '/redsquare/css/redsquare-tweet.css'
    );

    cleanup();
    expect(host.innerHTML).toBe('');
  });
});
