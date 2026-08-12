module.exports = (game_mod, invite_obj = {}) => {
  let publicKey = invite_obj.publicKey || null;
  let img = game_mod.respondTo('arcade-games')?.image || '';
  let title = game_mod.returnName();
  let description = game_mod.description || '';

  let html = `
    <form class="arcade-wizard saito-overlay-panel">
      <div class="identity">
        <div class="image">
          <img class="thumbnail" src="${img}" alt="">
        </div>
        <div class="details">
          <div class="title">${title}</div>
          <div class="description">${description}</div>
        </div>
        <input type="hidden" name="game" value="${game_mod.name}" />
      </div>

      <div class="controls">
        <div class="settings">
          ${game_mod.returnOptions()}
          <div id="arcade-advance-opt">
            <div class="advanced-text saito-anchor">advanced options...</div>
          </div>
        </div>
        <div class="actions">
  `;

  if (game_mod.maxPlayers == 1) {
    html += `<button type="button" id="game-invite-btn" class="fat saito-button-primary game-invite-btn" data-type="single">Play</button>`;
  } else {
    html += `
      <div class="saito-multi-select_btn saito-select">
        <div class="saito-multi-select_btn_options saito-slct">
    `;
    if (publicKey) {
      html += `<button type="button" class="saito-multi-btn game-invite-btn" data-type="direct">next...</button>`;
    } else if (invite_obj.league) {
      html += `
        <button type="button" class="saito-multi-btn game-invite-btn" data-type="open">create public league invite</button>
        <button type="button" class="saito-multi-btn game-invite-btn" data-type="private">create private league invite</button>
      `;
    } else {
      html += `
        <button type="button" class="saito-multi-btn game-invite-btn" data-type="open">create public invite</button>
        <button type="button" class="saito-multi-btn game-invite-btn" data-type="private">create private invite</button>
      `;
      if (game_mod?.can_play_async) {
        html += `<button type="button" class="saito-multi-btn game-invite-btn" data-type="async">create async invite</button>`;
      }
    }
    html += `</div></div>`;
  }

  html += `
        </div>
      </div>
  `;

  if (game_mod.publisher_message) {
    html += `<div class="publisher"><span>NOTE:</span> ${game_mod.publisher_message}</div>`;
  }

  html += `</form>`;
  return html;
};
