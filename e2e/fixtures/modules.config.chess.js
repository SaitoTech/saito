/**
 * Minimal modules needed to run a chess game in the browser.
 * Used by the chess browser e2e test.
 */
module.exports = {
  core: [
    'relay/relay.js',
    'encrypt/encrypt.js',
    'arcade/arcade.js',
    'chess/chess.js',
  ],
  lite: [
    'relay/relay.js',
    'encrypt/encrypt.js',
    'arcade/arcade.js',
    'chess/chess.js',
  ],
};
