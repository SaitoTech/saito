// GameBot's view of a context the game module already built. The game snapshot
// is pruned for the reader. The game module still owns returnContext().

function instructions(game_mod) {
  let title = 'this game';
  if (typeof game_mod?.returnTitle === 'function' && game_mod.returnTitle()) {
    title = game_mod.returnTitle();
  } else if (typeof game_mod?.returnName === 'function' && game_mod.returnName()) {
    title = game_mod.returnName();
  } else if (game_mod?.gamename || game_mod?.name) {
    title = game_mod.gamename || game_mod.name;
  }
  return (
    'You are playing ' +
    title +
    '. If it is your turn, respond with a JSON object containing a moves array. Every entry must be an available action identifier from the supplied context, in the exact order GameBot should execute them. A single action is one entry in the array. When a decision needs several clicks, return all of them in the same response.'
  );
}

function removeEmptyArrays(value) {
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
}

// The snapshot is already a copy. Empty arrays are removed at every level.
// Null, blank, and zero values are removed only from the top of the game.
function pruneGame(game) {
  removeEmptyArrays(game);
  for (const key of Object.keys(game)) {
    if (game[key] === null || game[key] === '' || game[key] === 0) {
      delete game[key];
    }
  }
}

function returnContext(game_mod, context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return context;
  }
  if (context.game && typeof context.game === 'object' && !Array.isArray(context.game)) {
    pruneGame(context.game);
  }
  const game = context.game;
  const menu = context.menu;
  const rest = { ...context };
  delete rest.instructions;
  delete rest.game;
  delete rest.menu;
  const finished = {
    instructions: instructions(game_mod),
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
