function scoredKeys(pinfo) {
  let keys = [];
  if (!pinfo) {
    return keys;
  }
  let lists = [pinfo.objectives_scored, pinfo.objectives_scored_this_round];
  for (let n = 0; n < lists.length; n++) {
    let list = lists[n] || [];
    for (let i = 0; i < list.length; i++) {
      if (keys.indexOf(list[i]) < 0) {
        keys.push(list[i]);
      }
    }
  }
  return keys;
}

function cardHtml(obj, note) {
  if (!obj || typeof obj.returnCardImage !== 'function') {
    return '';
  }
  let noteHtml = note ? `<div class="fs-objective-note">${note}</div>` : '';
  return `<div class="fs-objective">${obj.returnCardImage()}${noteHtml}</div>`;
}

function whoScored(mod, key) {
  let names = [];
  let infos = (mod.game.state && mod.game.state.players_info) || [];
  for (let i = 0; i < infos.length; i++) {
    if (scoredKeys(infos[i]).indexOf(key) >= 0) {
      names.push(mod.returnFactionNickname(i + 1));
    }
  }
  return names;
}

function publicCards(mod) {
  let html = '';
  let state = mod.game.state || {};
  let groups = [
    { keys: state.stage_i_objectives || [], deck: mod.stage_i_objectives || {} },
    { keys: state.stage_ii_objectives || [], deck: mod.stage_ii_objectives || {} }
  ];
  for (let g = 0; g < groups.length; g++) {
    let keys = groups[g].keys;
    let deck = groups[g].deck;
    for (let i = 0; i < keys.length; i++) {
      let obj = deck[keys[i]];
      if (!obj) {
        continue;
      }
      let names = whoScored(mod, keys[i]);
      let note = names.length ? 'Scored by ' + names.join(', ') : '';
      html += cardHtml(obj, note);
    }
  }
  return html;
}

function privateCards(mod, player) {
  let html = '';
  let shown = {};
  let infos = (mod.game.state && mod.game.state.players_info) || [];
  let pinfo = infos[player - 1];
  let mine = player == mod.game.player;
  let mineScored = scoredKeys(pinfo);

  if (mine && mod.game.deck && mod.game.deck[5] && mod.game.deck[5].hand) {
    let hand = mod.game.deck[5].hand;
    for (let i = 0; i < hand.length; i++) {
      let key = hand[i];
      let obj = mod.secret_objectives && mod.secret_objectives[key];
      if (!obj || shown[key]) {
        continue;
      }
      shown[key] = 1;
      html += cardHtml(obj, mineScored.indexOf(key) >= 0 ? 'Scored' : '');
    }
  }

  let players = mine ? infos.length : 1;
  for (let p = 0; p < players; p++) {
    let idx = mine ? p : player - 1;
    let scored = scoredKeys(infos[idx]);
    for (let i = 0; i < scored.length; i++) {
      let key = scored[i];
      if (shown[key]) {
        continue;
      }
      let obj = mod.secret_objectives && mod.secret_objectives[key];
      if (!obj) {
        continue;
      }
      shown[key] = 1;
      let note = 'Scored';
      if (mine && idx != player - 1) {
        note = 'Scored by ' + mod.returnFactionNickname(idx + 1);
      }
      html += cardHtml(obj, note);
    }
  }

  return html;
}

module.exports = (imperium_self, player) => {
  let publicHtml = publicCards(imperium_self);
  let privateHtml = privateCards(imperium_self, player);
  let mine = player == imperium_self.game.player;

  if (!publicHtml) {
    publicHtml = '<div class="fs-empty">No public objectives.</div>';
  }
  if (!privateHtml) {
    privateHtml = mine
      ? '<div class="fs-empty">No private objectives.</div>'
      : '<div class="fs-empty">No scored private objectives.</div>';
  }

  return `
    <div class="fs-objectives">
      <section class="fs-section">
        <h3>Public</h3>
        <div class="fs-objective-grid">${publicHtml}</div>
      </section>
      <section class="fs-section">
        <h3>Private</h3>
        <div class="fs-objective-grid">${privateHtml}</div>
      </section>
    </div>
  `;
};
