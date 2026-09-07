module.exports = (app, mod, invite) => {
  const image = invite.game_mod.respondTo('arcade-games')?.image || '';
  const tentative = invite.tentative || { join: [], leave: [] };
  const leaving = new Set(tentative.leave || []);
  const isInPlay = !invite.time_finished && invite.players.length >= invite.players_needed;

  let stateLabel = 'Open Invite';
  if (isInPlay) {
    stateLabel = 'In Play';
  }
  if (invite.time_finished) {
    stateLabel = 'Finished Game';
  }

  let playersHtml = '';
  let playerCount = 0;

  // Render players who have joined (marking any about to leave).
  for (const pkey of invite.players) {
    const isLeaving = leaving.has(pkey);
    playersHtml += playerBox(
      app,
      pkey,
      isLeaving ? 'leaving' : '',
      isLeaving ? 'leaving next hand' : '',
      invite.winner?.includes(pkey)
    );
    playerCount++;
  }

  // Render tentative joiners (pending seat requests not yet seated).
  for (const pkey of tentative.join || []) {
    if (!invite.players.includes(pkey)) {
      playersHtml += playerBox(app, pkey, 'pending', 'joining next hand');
      playerCount++;
    }
  }

  // Render players who were specifically requested to join.
  for (const pkey of invite.desired_opponent_publickeys) {
    playersHtml += playerBox(app, pkey, 'arcade-lounge-playerbox--requested');
    playerCount++;
  }

  // Empty seats are status indicators, not interactive checkboxes.
  for (let i = 0; i < invite.empty_slots; i++) {
    playersHtml += `
      <div class="arcade-lounge-playerbox arcade-lounge-playerbox--open saito-table-row">
        <div class="saito-identicon-box empty-slot" aria-hidden="true"></div>
        <div class="arcade-lounge-player-identity">
          <div class="saito-address">Open</div>
        </div>
      </div>`;
    playerCount++;
  }

  const eliminated = invite.options?.eliminated || {};
  let eliminatedHtml = '';
  for (const pkey in eliminated) {
    if (!invite.players.includes(pkey)) {
      const amt = typeof eliminated[pkey] === 'string' ? eliminated[pkey] : '';
      eliminatedHtml += playerBox(
        app,
        pkey,
        'eliminated',
        amt ? `cashed out ${amt}` : 'left the table'
      );
    }
  }

  let detailsHtml = formatOptions(invite.game_mod.returnShortGameOptionsArray(invite.options));
  if (invite.time_finished) {
    detailsHtml += addTimeStamp('finished at', app.browser.formatDate(invite.time_finished));
  } else if (invite.time_created) {
    detailsHtml += addTimeStamp('created at', app.browser.formatDate(invite.time_created));
  }
  if (invite?.step >= 0) {
    detailsHtml += detailRow('game moves', invite.step);
    if (invite?.game_status) {
      detailsHtml += detailRow('status', invite.game_status);
    }
  }
  if (invite?.method) {
    detailsHtml += detailRow('game ending', invite.method);
  }

  const controls = renderControls(mod, invite);
  const playerRows = Math.min(3, Math.max(1, Math.ceil(playerCount / 2)));
  const controlsState = isInPlay
    ? 'arcade-lounge-controls--in-play'
    : 'arcade-lounge-controls--standard';
  const gameStatus = app.browser.escapeHTML(String(invite.game_status || ''));
  const cryptoStake = invite.economic_line
    ? `<div class="arcade-lounge-current-stake"><span class="arcade-lounge-current-stake-label">Stake</span>${app.browser.escapeHTML(String(invite.economic_line))}</div>`
    : '';
  const headingStatus = isInPlay
    ? `${gameStatus ? `<div class="arcade-lounge-current-status">${gameStatus}</div>` : ''}${cryptoStake}`
    : `<h3 class="arcade-lounge-header-desc">${stateLabel}</h3>`;
  const detailsId = 'arcade-lounge-game-details';
  const detailsToggle = isInPlay
    ? `<button type="button" id="arcade-lounge-details-toggle" class="arcade-lounge-details-toggle" aria-expanded="false" aria-controls="${detailsId}">details</button>`
    : '';
  const eliminatedSection = eliminatedHtml
    ? `<div class="arcade-lounge-eliminated-label">Cashed out</div>
       <div class="arcade-lounge-players arcade-lounge-eliminated">${eliminatedHtml}</div>`
    : '';

  return `
    <div class="arcade-lounge arcade-lounge--invite arcade-lounge--four-sector saito-overlay-panel">
      <div class="arcade-lounge-art">
        <img class="arcade-lounge-hero" src="${image}" alt="">
      </div>

      <section class="arcade-lounge-info" aria-labelledby="arcade-lounge-title">
        <h1 id="arcade-lounge-title" class="arcade-lounge-header-title">${invite.game_name}</h1>
        ${headingStatus}
        <div id="${detailsId}" class="arcade-lounge-details saito-table"${isInPlay ? ' hidden' : ''}>
          <div class="saito-table-body">${detailsHtml}</div>
        </div>
        ${detailsToggle}
      </section>

      <section class="arcade-lounge-section hide-scrollbar" aria-label="Players">
        <div class="arcade-lounge-players">${playersHtml}</div>
        ${eliminatedSection}
      </section>

      <div class="arcade-lounge-chat"></div>
      <div class="arcade-lounge-controls ${controlsState} arcade-lounge-controls--${playerRows}-rows arcade-lounge-controls--${controls.length}-actions">${controls.join('')}</div>
    </div>`;
};

const playerBox = (app, pkey, extraClass = '', note = '', winner = false) => `
  <div class="arcade-lounge-playerbox saito-table-row ${extraClass}" id="invite-user-${pkey}">
    <div class="saito-identicon-box${winner ? ' winner' : ''}">
      <img class="saito-identicon" src="${app.keychain.returnIdenticon(pkey)}">
    </div>
    <div class="arcade-lounge-player-identity">
      ${app.browser.returnAddressHTML(pkey)}
      <div class="arcade-lounge-player-key" title="${app.browser.escapeHTML(pkey)}">${app.browser.escapeHTML(pkey)}</div>
      ${note ? `<div class="arcade-lounge-player-note">${note}</div>` : ''}
    </div>
    ${note ? '' : '<div class="online-status-indicator"></div>'}
  </div>`;

const renderControls = (mod, invite) => {
  const controls = [];

  if (!invite.time_finished) {
    if (invite.players.length >= invite.players_needed) {
      if (invite.players.includes(mod.publicKey)) {
        controls.push(
          `<div id="arcade-game-controls-continue-game" class="saito-button-primary">continue</div>`
        );
        if (invite.players.length > 1) {
          controls.push(
            `<div id="arcade-game-controls-forfeit-game" class="saito-button-secondary">forfeit</div>`
          );
        }
        controls.push(
          `<div id="arcade-game-controls-close-game" class="saito-button-secondary">cancel</div>`
        );
      } else if (invite.tentative?.join?.includes(mod.publicKey)) {
        controls.push(
          `<div id="arcade-game-controls-continue-join" class="saito-button-primary">continue</div>`,
          `<div id="arcade-game-controls-cancel-tentative" class="saito-button-secondary">cancel</div>`
        );
      } else if (invite.empty_slots) {
        controls.push(
          `<div id="arcade-game-controls-join-table" class="saito-button-primary">join table</div>`
        );
      } else if (invite.game_mod.enable_observer) {
        controls.push(
          `<div id="arcade-game-controls-watch-game" class="saito-button-primary">watch game</div>`
        );
        if (invite.game_mod.doesGameExistLocally(invite.game_id)) {
          controls.push(
            `<div id="arcade-game-controls-clear-game" class="saito-button-secondary">clear</div>`
          );
        }
      }
    } else if (invite.players.includes(mod.publicKey)) {
      if (mod.publicKey === invite.originator) {
        controls.push(
          `<div id="arcade-game-controls-invite-join" class="saito-button-primary"><i class="fa-solid fa-link"></i>share</div>`,
          `<div id="arcade-game-controls-cancel-join" class="saito-button-secondary">cancel</div>`
        );
      } else {
        controls.push(
          `<div id="arcade-game-controls-cancel-join" class="saito-button-secondary">leave invite</div>`
        );
      }
    } else if (invite.empty_slots > 0) {
      controls.push(
        `<div id="arcade-game-controls-join-game" class="saito-button-primary">join game</div>`
      );
    } else if (invite.desired_opponent_publickeys.includes(mod.publicKey)) {
      controls.push(
        `<div id="arcade-game-controls-join-game" class="saito-button-primary">join game</div>`,
        `<div id="arcade-game-controls-cancel-join" class="saito-button-secondary">decline invite</div>`
      );
    }
  } else if (invite.game_mod.doesGameExistLocally(invite.game_id)) {
    controls.push(
      `<div id="arcade-game-controls-continue-game" class="saito-button-primary">view game</div>`
    );
  } else if (invite.game_mod.enable_observer && invite?.step > 0) {
    controls.push(
      `<div id="arcade-game-controls-review-game" class="saito-button-primary">review game</div>`
    );
  }

  return controls;
};

const detailRow = (label, value) => `<div class="saito-table-row">
  <div class="arcade-lounge-key">${label}</div>
  <div class="arcade-lounge-value">${value}</div>
</div>`;

const formatOptions = (sgoa) => {
  let html = '';
  for (const key in sgoa) {
    if (sgoa[key] !== null) {
      html += detailRow(key.replace(/_/g, ' '), sgoa[key]);
    } else {
      html += `<div class="saito-table-row"><div class="arcade-lounge-key">${key.replace(/_/g, ' ')}</div></div>`;
    }
  }
  return html;
};

const addTimeStamp = (label, datetime) =>
  detailRow(label, `${datetime.hours}:${datetime.minutes}, ${datetime.day} ${datetime.month}`);
