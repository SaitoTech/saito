module.exports = (imperium_self, player) => {
  let pinfo = imperium_self.game.state.players_info[player - 1];
  let mine = player == imperium_self.game.player;

  if (!mine) {
    let n = pinfo ? pinfo.action_cards_in_hand : undefined;
    if (typeof n === 'number' && !isNaN(n)) {
      let label = n == 1 ? 'action card' : 'action cards';
      return `<div class="fs-action-cards"><div class="fs-action-count">${n} ${label}</div></div>`;
    }
    return '<div class="fs-empty">opponent action cards are not visible</div>';
  }

  let keys = [];
  if (typeof imperium_self.returnPlayerActionCards === 'function') {
    keys = imperium_self.returnPlayerActionCards(player) || [];
  }

  if (!keys.length) {
    return '<div class="fs-empty">No action cards.</div>';
  }

  let html = '<div class="fs-action-cards">';
  for (let i = 0; i < keys.length; i++) {
    let card = imperium_self.action_cards[keys[i]];
    if (!card) {
      continue;
    }
    html += `
      <article class="fs-entry">
        <div class="fs-entry-title">${card.name}</div>
        <div class="fs-entry-text">${card.text}</div>
      </article>
    `;
  }
  html += '</div>';
  return html;
};
