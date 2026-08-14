module.exports = (app, mod, invite) => {
  let game_tx = mod.returnGameTransaction(invite.game_id);

  let desc = invite.verbose_game_type;

  if (invite.players.length >= invite.players_needed) {
    desc = 'active game';
  }

  if (invite.time_finished) {
    desc = 'finished game';
  }

  let html = `
  <div class="arcade-lounge arcade-lounge--invite saito-overlay-panel">
  <div class="arcade-lounge-header header">
	  <div class="arcade-lounge-header-image image" style="background-image: url('${invite.game_mod.respondTo('arcade-games').image}')">
	  </div>
	  <div class="arcade-lounge-header-title title">${invite.game_name}</div>
	  <div class="arcade-lounge-header-desc desc">${desc}</div>
  </div>
  <div class="arcade-lounge-body body">
	  <div class="arcade-lounge-section hide-scrollbar">
	    <div class="arcade-lounge-players players">
	`;

  const tentative = invite.tentative || { join: [], leave: [] };
  const leaving = new Set(tentative.leave || []);

  // render players who have joined (marking any about to leave)
  for (let i = 0; i < invite.players.length; i++) {
    const pkey = invite.players[i];
    const isLeaving = leaving.has(pkey);
    html += `
		  <div class="arcade-lounge-playerbox saito-table-row ${isLeaving ? 'leaving' : ''}" id="invite-user-${pkey}">
		    <div class="saito-identicon-box${invite.winner?.includes(pkey) ? ' winner' : ''}">
          <img class="saito-identicon" src="${app.keychain.returnIdenticon(pkey)}">
        </div>
		    ${app.browser.returnAddressHTML(pkey)}
        ${isLeaving ? '<div class="arcade-lounge-player-note">leaving next hand</div>' : '<div class="online-status-indicator"></div>'}
		  </div>
			`;
  }

  // render tentative joiners (pending seat requests not yet seated)
  for (let i = 0; i < (tentative.join || []).length; i++) {
    const pkey = tentative.join[i];
    if (invite.players.includes(pkey)) {
      continue;
    }
    html += `
		  <div class="arcade-lounge-playerbox saito-table-row pending" id="invite-user-${pkey}">
		    <div class="saito-identicon-box">
          <img class="saito-identicon" src="${app.keychain.returnIdenticon(pkey)}">
        </div>
		    ${app.browser.returnAddressHTML(pkey)}
        <div class="arcade-lounge-player-note">joining next hand</div>
		  </div>
			`;
  }

  // render players who are requested to join
  for (let i = 0; i < invite.desired_opponent_publickeys.length; i++) {
    html += `
      <div class="arcade-lounge-playerbox saito-table-row arcade-lounge-playerbox--requested" id="invite-user-${invite.desired_opponent_publickeys[i]}">
	      <div class="saito-identicon-box">
	      	<img class="saito-identicon" src="${app.keychain.returnIdenticon(invite.desired_opponent_publickeys[i])}">
	      </div>
 	      ${app.browser.returnAddressHTML(invite.desired_opponent_publickeys[i])}
        <div class="online-status-indicator"></div>
	    </div>
     `;
  }

  // render empty slots
  for (let i = 0; i < invite.empty_slots; i++) {
    html += `
	        <div class="arcade-lounge-playerbox saito-table-row">
	      			<div class="saito-identicon-box empty-slot"></div>
	    			<div class="saito-address">open player slot</div>
	  			</div>
		    `;
  }

  html += `
	      </div>`;

  // render players who have cashed out / been eliminated
  const eliminated = invite.options?.eliminated || {};
  let eliminatedHtml = '';
  for (const pkey in eliminated) {
    if (invite.players.includes(pkey)) {
      continue;
    }
    const amt = typeof eliminated[pkey] === 'string' ? eliminated[pkey] : '';
    eliminatedHtml += `
		  <div class="arcade-lounge-playerbox saito-table-row eliminated" id="invite-user-${pkey}">
		    <div class="saito-identicon-box">
          <img class="saito-identicon" src="${app.keychain.returnIdenticon(pkey)}">
        </div>
		    ${app.browser.returnAddressHTML(pkey)}
        <div class="arcade-lounge-player-note">${amt ? `cashed out ${amt}` : 'left the table'}</div>
		  </div>`;
  }
  if (eliminatedHtml) {
    html += `<div class="arcade-lounge-eliminated-label">Cashed out</div>
	    <div class="arcade-lounge-players arcade-lounge-eliminated">${eliminatedHtml}</div>`;
  }

  html += `
	    <div class="saito-table">
			  <div class="saito-table-body">
	`;

  html += formatOptions(invite.game_mod.returnShortGameOptionsArray(invite.options));
  if (invite.time_finished) {
    let datetime = app.browser.formatDate(invite.time_finished);
    html += addTimeStamp('finished at', datetime);
  } else if (invite.time_created) {
    let datetime = app.browser.formatDate(invite.time_created);
    html += addTimeStamp('created at', datetime);
  }
  if (invite?.step >= 0) {
    html += `<div class="saito-table-row">
              <div class="arcade-lounge-key">game moves</div>
							<div class="arcade-lounge-value">${invite.step}</div>
					</div>`;
    if (invite?.game_status) {
      html += `<div class="saito-table-row">
              <div class="arcade-lounge-key">status</div>
							<div class="arcade-lounge-value">${invite.game_status}</div>
					</div>`;
    }
  }
  if (invite?.method) {
    html += `<div class="saito-table-row">
              <div class="arcade-lounge-key">game ending</div>
							<div class="arcade-lounge-value">${invite.method}</div>
					</div>`;
  }

  html += `
			  </div>
		  </div>
	    </div>
	  </div>
	  <div class="arcade-lounge-chat"></div>
	  <div class="arcade-lounge-controls">`;

  if (!invite.time_finished) {
    if (invite.players.length >= invite.players_needed) {
      if (invite.players.includes(mod.publicKey)) {
        html += `<div id="arcade-game-controls-continue-game" class="fat saito-button-primary">continue game</div>`;
        if (invite.players.length > 1) {
          html += `<div id="arcade-game-controls-forfeit-game" class="fat saito-button-secondary">forfeit game</div>`;
        } else {
          console.debug(invite);
        }
        html += `<div id="arcade-game-controls-close-game" class="fat saito-button-secondary">cancel game</div>`;
      } else if (invite.tentative?.join?.includes(mod.publicKey)) {
        // viewer already has a pending seat request at this table
        html += `<div id="arcade-game-controls-continue-join" class="fat saito-button-primary">continue</div>`;
        html += `<div id="arcade-game-controls-cancel-tentative" class="fat saito-button-secondary">cancel</div>`;
      } else if (invite.empty_slots) {
        html += `<div id="arcade-game-controls-join-table" class="fat saito-button-primary">join table</div>`;
      } else if (invite.game_mod.enable_observer) {
        html += `<div id="arcade-game-controls-watch-game" class="fat saito-button-primary">watch game</div>`;
        if (invite.game_mod.doesGameExistLocally(invite.game_id)) {
          html += `<div id="arcade-game-controls-clear-game" class="fat saito-button-secondary">clear</div>`;
        }
      }
    } else {
      if (invite.players.includes(mod.publicKey)) {
        if (mod.publicKey === invite.originator) {
          html += `<div id="arcade-game-controls-invite-join" class="fat saito-button-primary"><i class="fa-solid fa-link"></i>share</div>`;
          html += `<div id="arcade-game-controls-cancel-join" class="fat saito-button-secondary">cancel invite</div>`;
        } else {
          html += `<div id="arcade-game-controls-cancel-join" class="fat saito-button-secondary">leave invite</div>`;
        }
      } else if (invite.empty_slots > 0) {
        html += `<div id="arcade-game-controls-join-game" class="fat saito-button-primary">join game</div>`;
      } else if (invite.desired_opponent_publickeys.includes(mod.publicKey)) {
        html += `<div id="arcade-game-controls-join-game" class="fat saito-button-primary">join game</div>
								<div id="arcade-game-controls-cancel-join" class="fat saito-button-secondary">decline invite</div>`;
      }
    }
  } else {
    if (invite.game_mod.doesGameExistLocally(invite.game_id)) {
      html += `<div id="arcade-game-controls-continue-game" class="fat saito-button-primary">view game</div>`;
    } else if (invite.game_mod.enable_observer && invite?.step > 0) {
      html += `<div id="arcade-game-controls-review-game" class="fat saito-button-primary">review game</div>`;
    }
  }

  html += `
	  </div>
</div>
  `;

  return html;
};

const formatOptions = (sgoa) => {
  let html = '';
  for (let i in sgoa) {
    html += `<div class="saito-table-row">
                <div class="arcade-lounge-key">${i.replace(/_/g, ' ')}</div>`;
    if (sgoa[i] !== null) {
      html += `<div class="arcade-lounge-value">${sgoa[i]}</div>`;
    }
    html += '</div>';
  }
  return html;
};

const addTimeStamp = (label, datetime) => {
  return `<div class="saito-table-row">
              <div class="arcade-lounge-key">${label}</div>
							<div class="arcade-lounge-value">${datetime.hours}:${datetime.minutes}, ${datetime.day} ${datetime.month}</div>
					</div>`;
};
