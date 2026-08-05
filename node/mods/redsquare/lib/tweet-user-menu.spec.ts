const TweetTemplate = require('./tweet.template');

describe('RedSquare tweet author menu triggers', () => {
  const publicKey = 'tweet-author-public-key';
  const tweet = {
    signature: 'tweet-signature',
    publicKey,
    username: 'Alice',
    avatar: '/alice.png',
    text: 'hello',
    images: [],
    replies: 0,
    retweets: 0,
    likes: 0,
    time: 'now'
  };

  test('adds the author key to the timeline identicon and registered name', () => {
    const html = TweetTemplate(tweet);

    expect(html).toContain(
      `class="avatar saito-identicon" src="/alice.png" alt="Alice" data-id="${publicKey}"`
    );
    expect(html).toContain(`class="primary saito-address" data-id="${publicKey}">Alice</span>`);
  });

  test('marks the expanded public key as a user-menu trigger', () => {
    const html = TweetTemplate(tweet, 'tweet focused', { presentation: 'focused' });

    expect(html).toContain(
      `class="handle saito-userline saito-add-user-menu" data-id="${publicKey}">${publicKey}</span>`
    );
  });
});
