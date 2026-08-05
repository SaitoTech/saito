export {};

const ComposeOverlay = require('./compose');

describe('RedSquare compose completion', () => {
  test('completes a caller exactly once', () => {
    const compose = Object.create(ComposeOverlay.prototype);
    const onComplete = jest.fn();
    compose.onComplete = onComplete;
    const tx = { signature: 'published-transaction' };

    compose.complete(tx);
    compose.complete(null);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(tx);
  });
});
