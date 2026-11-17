class GameBotAI {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  // Whether the installed game is waiting on this seat. A null move means
  // returnContext() does not say, and V1 does not invent a game-specific test.
  shouldMove(gameMod) {
    let context = {};
    try {
      context = gameMod?.returnContext?.() || {};
    } catch (err) {
      return {
        move: null,
        reason: err?.message || 'returnContext() failed',
        context: {}
      };
    }

    const game = context.game;
    if (!game || typeof game !== 'object') {
      return {
        move: null,
        reason: 'returnContext() did not include a game snapshot',
        context
      };
    }
    if (game.over) {
      return { move: false, reason: 'the game is over', context };
    }
    if (!Number(game.player)) {
      return { move: false, reason: 'this seat is not a player', context };
    }
    if (game.target == null || game.target === '') {
      return {
        move: null,
        reason: 'returnContext() does not say whose turn it is (game.target is empty)',
        context
      };
    }
    const mine = Number(game.target) === Number(game.player);
    return {
      move: mine,
      reason: mine ? "it is this seat's turn" : 'waiting for another seat',
      context
    };
  }

  // Prepare the context for display. V1 does not infer a move.
  analyseMove(gameMod, interactions = []) {
    const decision = this.shouldMove(gameMod);
    return {
      context: decision.context,
      shouldMove: decision.move,
      reason: decision.reason,
      interactions
    };
  }

  resolve(response, interactions = []) {
    const text = String(response || '').trim();
    if (!text) {
      return null;
    }
    if (/^\d+$/.test(text)) {
      return interactions[Number(text) - 1] || null;
    }
    const exact = interactions.find((item) => item.id === text || item.value === text);
    if (exact) {
      return exact;
    }
    const folded = text.toLowerCase();
    const matches = interactions.filter((item) => {
      return (
        String(item.label || '').toLowerCase() === folded ||
        String(item.id || '').toLowerCase() === folded
      );
    });
    return matches.length === 1 ? matches[0] : null;
  }

  // The manual response and a future engine both end here. The game module
  // still creates the Saito move.
  async executeMove(gameMod, response, dom) {
    const interactions = dom.interactions(gameMod);
    const chosen = this.resolve(response, interactions);
    if (!chosen) {
      throw new Error('No matching interaction. Use a listed number or id.');
    }
    await dom.execute(gameMod, chosen);
    return chosen;
  }
}

module.exports = GameBotAI;
