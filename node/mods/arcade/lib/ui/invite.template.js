module.exports = (app, mod, invite) => {
  let invite_class =
    invite.target && invite.players[invite.target - 1] == mod.publicKey ? ' my-turn' : '';
  let invite_img = `/${invite.game_slug}/img/arcade/arcade-banner-background.png`;

  let html = `
          <div class="arcade-invite${invite_class}" id="arcade-invite-${invite.game_id}"
      				style="background-image: url('${invite_img}');">
        <div class="header">
          <div class="title">${invite.game_name}</div>
          <div class="details">${invite.game_type.toUpperCase()}</div>
        </div>
        <div class="actions">
          <div class="players">
    `;

  // render players who have joined
  for (let i = 0; i < invite.players.length; i++) {
    html += `
          <div class="player">
            <img class="saito-identicon" id-${invite.players[i]}"
            				src="${app.keychain.returnIdenticon(invite.players[i])}">
          </div>`;
  }

  // render tentative joiners (pending seat requests)
  const tentative_join = invite.tentative?.join || [];
  for (let i = 0; i < tentative_join.length; i++) {
    const pkey = tentative_join[i];
    if (invite.players.includes(pkey)) {
      continue;
    }
    html += `
          <div class="saito-identicon-box arcade-invite-pending">
            <img class="saito-module-identicon saito-identicon" id-${pkey}"
            				src="${app.keychain.returnIdenticon(pkey)}">
          </div>`;
  }

  // render players who are requested to join (their slot isnt empty)
  for (let i = 0; i < invite.desired_opponent_publickeys.length; i++) {
    html += `
          <div class="requested">
            <img class="saito-identicon" id-${invite.desired_opponent_publickeys[i]}"
            			src="${app.keychain.returnIdenticon(invite.desired_opponent_publickeys[i])}">
          </div>
      `;
  }

  // render empty slots; empty slots =  players needed - (players joined + players requested)
  for (let i = 0; i < invite.empty_slots; i++) {
    html += `
          <div class="slot"></div>
      `;
  }

  html += `
          </div>
        </div>`;

  if (invite_class) {
    html += `<div class="badge">your turn</div>`;
  }
  // Overwrite "your turn" as necessary
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
