// GameBot's view of a context the game module already built. The game snapshot
// is pruned for the reader. The game module still owns returnContext().

function returnContext(game_mod, context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return context;
  }

  // The snapshot is already a copy. Empty arrays are removed at every level.
  // Null, blank, and zero values are removed only from the top of the game.
  if (context.game && typeof context.game === 'object' && !Array.isArray(context.game)) {
    const removeEmptyArrays = (value) => {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          value[i] = removeEmptyArrays(value[i]);
        }
        return value.filter((entry) => !(Array.isArray(entry) && entry.length === 0));
      }
      if (!value || typeof value !== 'object') {
        return value;
      }
      for (const key of Object.keys(value)) {
        const child = removeEmptyArrays(value[key]);
        if (Array.isArray(child) && child.length === 0) {
          delete value[key];
        } else {
          value[key] = child;
        }
      }
      return value;
    };
    removeEmptyArrays(context.game);
    for (const key of Object.keys(context.game)) {
      if (context.game[key] === null || context.game[key] === '' || context.game[key] === 0) {
        delete context.game[key];
      }
    }
  }

  // Name the game, then put the instruction, the game, and the menu in that order.
  let title = 'this game';
  if (typeof game_mod?.returnTitle === 'function' && game_mod.returnTitle()) {
    title = game_mod.returnTitle();
  } else if (typeof game_mod?.returnName === 'function' && game_mod.returnName()) {
    title = game_mod.returnName();
  } else if (game_mod?.gamename || game_mod?.name) {
    title = game_mod.gamename || game_mod.name;
  }
  const game = context.game;
  const menu = context.menu;
  const supplied = typeof context.instructions === 'string' ? context.instructions : '';
  const rest = { ...context };
  delete rest.instructions;
  delete rest.game;
  delete rest.menu;
  const finished = {
    instructions:
      supplied ||
      'You are playing ' +
        title +
        '. Pick a move from the menu array and respond with the id, identifier, or label of your preferred choice.',
    ...rest
  };
  if (game !== undefined) {
    finished.game = game;
  }
  if (menu !== undefined) {
    finished.menu = menu;
  }
  return finished;
}

module.exports = {
  returnContext
};
