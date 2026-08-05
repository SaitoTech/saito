export {};

const TweetMenu = require('./tweet-menu');

describe('RedSquare tweet menu responders', () => {
  test('appends responder actions with root and selected-tweet context', () => {
    const callback = jest.fn();
    const transaction = {
      signature: 'source-signature',
      from: [{ publicKey: 'reporter-public-key' }]
    };
    const tweet = {
      signature: 'source-signature',
      thread_id: 'root-signature',
      publicKey: 'reporter-public-key',
      username: 'Reporter',
      tx: transaction
    };
    const getRespondTos = jest.fn(() => [
      {
        id: 'bugs-capture',
        text: 'Capture as Bug',
        icon: 'fa-solid fa-bug',
        callback
      }
    ]);
    const menu = new TweetMenu({ modules: { getRespondTos } }, {});

    const actions = menu.buildActions(tweet);
    const capture = actions.find((action) => action.id === 'bugs-capture');

    expect(getRespondTos).toHaveBeenCalledWith('redsquare-tweet-menu', {
      tweet,
      transaction,
      root_tx_sig: 'root-signature',
      source_tx_sig: 'source-signature',
      reporter_publickey: 'reporter-public-key'
    });
    expect(capture).toMatchObject({
      label: 'Capture as Bug',
      icon: 'fa-solid fa-bug'
    });

    capture.handler();
    expect(callback).toHaveBeenCalledWith({
      tweet,
      transaction,
      root_tx_sig: 'root-signature',
      source_tx_sig: 'source-signature',
      reporter_publickey: 'reporter-public-key'
    });
  });

  test('uses a root tweet signature when no explicit thread id exists', () => {
    const getRespondTos = jest.fn(() => []);
    const tweet = {
      signature: 'root-signature',
      publicKey: 'reporter-public-key',
      tx: { signature: 'root-signature' }
    };
    const menu = new TweetMenu({ modules: { getRespondTos } }, {});

    menu.buildActions(tweet);

    expect(getRespondTos).toHaveBeenCalledWith(
      'redsquare-tweet-menu',
      expect.objectContaining({
        root_tx_sig: 'root-signature',
        source_tx_sig: 'root-signature'
      })
    );
  });
});
