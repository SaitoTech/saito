/**
 * Twilight-specific NFT sandbox context.
 * Invoked with .call(this[, cardId]) from returnContext(). Extends the engine
 * context from GameTemplate.returnContext() (which already supplies context.game).
 * Do not re-copy game state, player, side, decks, or options.nfts here.
 *
 * context.commands comes from returnNftQueuePolicy() via GameTemplate.returnContext().
 */

module.exports = {
  // Intentionally empty: Twilight adds commands through returnNftQueuePolicy(),
  // not by replacing context.commands here.
};
