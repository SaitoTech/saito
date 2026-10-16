class ImperiumLog {
  constructor(mod) {
    this.mod = mod;
  }

  pending() {
    let state = this.mod.game && this.mod.game.state;
    if (!state) {
      return null;
    }
    return state.pending_imperium_log || null;
  }

  place(sector, planet_idx) {
    let sys = null;
    try {
      sys = this.mod.returnSectorAndPlanets(sector);
    } catch (err) {}
    if (
      planet_idx != null &&
      planet_idx !== '' &&
      sys &&
      sys.p &&
      sys.p[planet_idx] &&
      sys.p[planet_idx].name
    ) {
      return sys.p[planet_idx].name;
    }
    if (sys && sys.s && sys.s.name) {
      return sys.s.name;
    }
    return sector;
  }

  // Start a cluster. A later updateLog with no event type is stored here
  // until flush publishes one expandable row.
  open(kind, summary) {
    this.flush();
    if (!this.mod.game || !this.mod.game.state) {
      return;
    }
    this.mod.game.state.pending_imperium_log = {
      kind: kind,
      summary: summary,
      rows: []
    };
  }

  // Keep an open cluster when the same fight continues (bombardment, then ground).
  ensure(kind, summary) {
    let rec = this.pending();
    if (rec && rec.kind === kind && rec.summary === summary) {
      return;
    }
    this.open(kind, summary);
  }

  absorb(str) {
    let rec = this.pending();
    if (!rec) {
      return false;
    }
    rec.rows.push(String(str));
    return true;
  }

  flush() {
    let state = this.mod.game && this.mod.game.state;
    if (!state || !state.pending_imperium_log) {
      return;
    }
    let rec = state.pending_imperium_log;
    state.pending_imperium_log = null;
    if (!rec.rows || rec.rows.length === 0) {
      return;
    }
    this.mod.updateLog(rec.summary, rec.kind, { rows: rec.rows });
  }

  render(entries) {
    let entry = entries && entries[0];
    if (!entry) {
      return '';
    }
    let rows = entry.data && entry.data.rows;
    if (!rows || !rows.length) {
      return entry.msg || '';
    }
    let body = '';
    for (let i = 0; i < rows.length; i++) {
      body += '<div>' + rows[i] + '</div>';
    }
    let kind = 'ri-' + (entry.type || 'combat');
    return (
      '<details class="ri-log ' +
      kind +
      '"><summary>' +
      entry.msg +
      '</summary>' +
      body +
      '</details>'
    );
  }
}

module.exports = ImperiumLog;
