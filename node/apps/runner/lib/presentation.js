// Default presentation sinks for a player with no screen.
// Twilight and Paths install their local DOM event bridges after these defaults.
// Game rules/decision methods are deliberately NOT intercepted here.
module.exports = function installPresentation(mod) {
  const noop = () => {};
  for (const name of ['hud', 'clock', 'playerbox', 'cardfan', 'cardbox', 'menu', 'overlay',
    'acknowledge_overlay', 'observerControls', 'game_help', 'card_overlay']) {
    const component = mod[name];
    if (!component) continue;
    for (let proto = Object.getPrototypeOf(component); proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)) {
      for (const method of Object.getOwnPropertyNames(proto)) {
        if (method !== 'constructor' && typeof component[method] === 'function') component[method] = noop;
      }
    }
  }
  mod.updateStatus = function (message) { this.game.status = message; };
  mod.updateLog = function (message) {
    this.game.log ||= [];
    this.game.log.push(message);
    if (this.game.log.length > 150) this.game.log.shift();
  };
  for (const name of ['notifyMove', 'gameOverUserInterface', 'setPlayerActive',
    'startClock', 'stopClock', 'clearShotClock', 'setShotClock']) mod[name] = noop;
};
