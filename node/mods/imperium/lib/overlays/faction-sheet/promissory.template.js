module.exports = (imperium_self, player) => {
  let pinfo = imperium_self.game.state.players_info[player - 1];
  let faction = imperium_self.returnFactions()[pinfo.faction];
  let notes = faction.promissary_notes || [];
  let html = '<div class="fs-promissory">';

  if (!notes.length) {
    return '<div class="fs-empty">No promissory notes recorded for this faction.</div>';
  }

  for (let i = 0; i < notes.length; i++) {
    let key = notes[i];
    let note = imperium_self.promissary_notes[key];
    if (!note && key.indexOf(faction.id) != 0) {
      note = imperium_self.promissary_notes[faction.id + '-' + key] || imperium_self.promissary_notes[key];
    }
    if (!note) {
      continue;
    }
    html += `
      <article class="fs-entry">
        <div class="fs-entry-title">${note.name}</div>
        <div class="fs-entry-text">${note.text}</div>
      </article>
    `;
  }

  html += '</div>';
  return html;
};
