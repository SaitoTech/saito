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
  <div class="arcade-lounge arcade-lounge--invite">
  <div class="arcade-lounge-header">
	  <div class="arcade-lounge-header-image" style="background-image: url('${invite.game_mod.respondTo('arcade-games').image}')">
	  </div>
	  <div class="arcade-lounge-header-title">${invite.game_name}</div>
	  <div class="arcade-lounge-header-desc">${desc}</div>
  </div>
  <div class="arcade-lounge-body">
	  <div class="arcade-lounge-section hide-scrollbar">
	    <div class="arcade-lounge-players">
	`;

	// render players who have joined
	for (let i = 0; i < invite.players.length; i++) {
		html += `
		  <div class="arcade-lounge-playerbox saito-table-row" id="invite-user-${invite.players[i]}">
		    <div class="saito-identicon-box${invite.winner?.includes(invite.players[i]) ? ' winner' : ''}">
          <img class="saito-identicon" src="${app.keychain.returnIdenticon(invite.players[i])}">
        </div>
		    ${app.browser.returnAddressHTML(invite.players[i])}
        <div class="online-status-indicator"></div>
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
	      </div>
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
			} else if (invite.empty_slots) {
				html += `<div id="arcade-game-controls-watch-game" class="fat saito-button-primary">join table</div>`;
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
