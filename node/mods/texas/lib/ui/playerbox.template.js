module.exports = (obj) => {
  return `
    <div class="texas-playerbox game-playerbox game-playerbox-${obj.player_number}" id="game-playerbox-${obj.player_number}" data-character="${obj.character_id}">
      <div class="playerbox-character" data-character="${obj.character_id}"><img class="playerbox-character-img" src="${obj.character_src}" alt=""></div>
      <div class="playerbox-info">
        <div class="playerbox-name">${obj.name}</div>
        <div class="playerbox-chips">${obj.chips_html || ''}</div>
        <div class="playerbox-action">${obj.action || ''}</div>
      </div>
      <div class="playerbox-mark"></div>
      <div class="game-playerbox-graphics game-playerbox-graphics-${obj.player_number}"></div>
    </div>
  `;
};
