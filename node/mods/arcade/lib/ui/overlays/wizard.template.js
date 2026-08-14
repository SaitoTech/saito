module.exports = (game_mod, invite_obj = {}) => {
  let publicKey = invite_obj.publicKey || null;
  let img = game_mod.respondTo('arcade-games')?.image || '';
  let title = invite_obj.rom_title || game_mod.returnName();
  let description = invite_obj.rom_title ? game_mod.description || '' : game_mod.description || '';
  let publisher = game_mod.publisher_message
    ? `<div class="publisher"><span>NOTE:</span> ${game_mod.publisher_message}</div>`
    : '';

  let html = `
    <form class="arcade-wizard saito-overlay-panel">
      <div class="body">
        <div class="art">
          <img class="hero" src="${img}" alt="">
        </div>
        <div class="info">
          <div class="title">${title}</div>
          <div class="description">${description}</div>
          ${publisher}
        </div>
        <input type="hidden" name="game" value="${game_mod.name}" />
        <div class="settings">
          ${game_mod.returnOptions()}
          <div id="arcade-advance-opt">
            <button type="button" class="advanced-btn" aria-label="Advanced options">
              <i class="fa-solid fa-gear" aria-hidden="true"></i>
              <span>Advanced</span>
            </button>
          </div>
        </div>
        <div class="actions">
  `;

  if (game_mod.maxPlayers == 1) {
    html += `<button type="button" id="game-invite-btn" class="fat saito-button-primary game-invite-btn" data-type="single">Play</button>`;
  } else {
    let invite_options = [];

    if (publicKey) {
      invite_options.push({ type: 'direct', label: 'Next…' });
    } else if (invite_obj.league) {
      invite_options.push(
        { type: 'open', label: 'CREATE PUBLIC INVITE' },
        { type: 'private', label: 'CREATE PRIVATE INVITE' }
      );
    } else {
      invite_options.push(
        { type: 'open', label: 'CREATE PUBLIC INVITE' },
        { type: 'private', label: 'CREATE PRIVATE INVITE' }
      );
      if (game_mod?.can_play_async) {
        invite_options.push({ type: 'async', label: 'CREATE ASYNC INVITE' });
      }
    }

    let primary = invite_options[0];

    html += `
      <div class="invite-control">
        <button type="button" class="fat saito-button-primary invite-primary game-invite-btn" data-type="${primary.type}">
          ${primary.label}
        </button>
    `;

    if (invite_options.length > 1) {
      html += `
        <button type="button" class="invite-toggle" aria-label="Choose invite type" aria-expanded="false" aria-haspopup="listbox">
          <span aria-hidden="true">▾</span>
        </button>
        <div class="invite-menu" role="listbox" hidden>
      `;

      for (let opt of invite_options) {
        html += `
          <button type="button" class="invite-option" data-type="${opt.type}" role="option">
            ${opt.label}
          </button>
        `;
      }

      html += `</div>`;
    }

    html += `</div>`;
  }

  html += `
        </div>
      </div>
    </form>
  `;
  return html;
};
