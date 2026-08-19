module.exports = (app, mod, invite) => {
  let invite_class =
    invite.target && invite.players[invite.target - 1] == mod.publicKey ? ' my-turn' : '';
  let invite_img = `/${String(invite.game_slug || '').replace(/[^a-zA-Z0-9_-]/g, '')}/img/arcade/arcade-banner-background.png`;

  let badge = '';
  if (invite_class) {
    badge = `<div class="badge">your turn</div>`;
  }
  if (invite.winner) {
    if (invite.winner.includes(mod.publicKey)) {
      badge = `<div class="badge">you won</div>`;
    } else {
      badge = `<div class="badge">you lost</div>`;
    }
  }

  let economic_badge_html = '';
  if (invite.economic_badge) {
    const badge_kind = invite.economic_badge === 'PRIZE' ? 'prize' : 'stake';
    economic_badge_html = `<div class="economic-badge economic-badge--${badge_kind}" aria-label="${app.browser.escapeHTML(invite.economic_badge)}">${app.browser.escapeHTML(invite.economic_badge)}</div>`;
  }

  const details_line = invite.economic_line
    ? invite.economic_line
    : String(invite.game_type || '').toUpperCase();

  let html = `
    <div class="invite arcade-invite${invite_class}" id="arcade-invite-${invite.game_id}"
         style="background-image: url('${invite_img}');">
      ${economic_badge_html}
      <div class="header">
        <div class="title">${app.browser.escapeHTML(invite.game_name)}</div>
        <div class="details">${app.browser.escapeHTML(details_line)}</div>
      </div>
      <div class="actions">
        ${badge}
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
          <div class="pending">
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
      </div>
    </div>`;

  return html;
};
