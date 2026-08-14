/**
 * Legacy template shim — Teasers renders via Teaser instances.
 */
module.exports = (app, mod) => {
  const Teaser = require('./teaser');
  let html = '';
  for (let i = 0; i < mod.games.length; i++) {
    html += new Teaser(app, mod, mod.games[i]).renderHTML();
  }
  html += new Teaser(app, mod, null, { is_add_game: true }).renderHTML();
  return html;
};
