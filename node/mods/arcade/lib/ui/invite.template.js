module.exports = (app, mod, invite) => {
  let invite_class =
    invite.target && invite.players[invite.target - 1] == mod.publicKey ? ' my-turn' : '';
  let invite_img = `/${invite.game_slug}/img/arcade/arcade-banner-background.png`;

  let html = `
    <div class="invite arcade-invite${invite_class}" id="arcade-invite-${invite.game_id}"
         style="background-image: url('${invite_img}');">
      <div class="header">
        <div class="title">${invite.game_name}</div>
        <div class="details">${invite.game_type.toUpperCase()}</div>
      </div>
      <div class="actions">
        <div class="players">
  `;

  for (let i = 0; i < invite.players.length; i++) {
    html += `
          <div class="player">
            <img class="saito-identicon" id="${invite.players[i]}"
                 src="${app.keychain.returnIdenticon(invite.players[i])}">
          </div>`;
  }

  const tentative_join = invite.tentative?.join || [];
  for (let i = 0; i < tentative_join.length; i++) {
    const pkey = tentative_join[i];
    if (invite.players.includes(pkey)) {
      continue;
    }
    html += `
          <div class="saito-identicon-box pending">
            <img class="saito-module-identicon saito-identicon" id="${pkey}"
                 src="${app.keychain.returnIdenticon(pkey)}">
          </div>`;
  }

  for (let i = 0; i < invite.desired_opponent_publickeys.length; i++) {
    html += `
          <div class="requested">
            <img class="saito-identicon" id="${invite.desired_opponent_publickeys[i]}"
                 src="${app.keychain.returnIdenticon(invite.desired_opponent_publickeys[i])}">
          </div>
      `;
  }

  for (let i = 0; i < invite.empty_slots; i++) {
    html += `<div class="slot"></div>`;
  }

  html += `
        </div>
      </div>`;

  if (invite_class) {
    html += `<div class="badge">your turn</div>`;
  }
  if (invite.winner) {
    if (invite.winner.includes(mod.publicKey)) {
      html += `<div class="badge">you won</div>`;
    } else {
      html += `<div class="badge">you lost</div>`;
    }
  }

  html += `</div>`;

  return html;
};
