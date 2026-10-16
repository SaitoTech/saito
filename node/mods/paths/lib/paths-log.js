class PathsLog {
  constructor(mod) {
    this.mod = mod;
  }

  pending() {
    if (!this.mod.game.state.pending_movement_log) {
      this.mod.game.state.pending_movement_log = [];
    }
    return this.mod.game.state.pending_movement_log;
  }

  label(name) {
    let match = /^([A-Z]{2,}) Army$/.exec(name || '');
    if (match) {
      return match[1];
    }
    return name || '';
  }

  sideName(faction) {
    if (faction === 'central') {
      return 'Central Powers';
    }
    return 'Allied Powers';
  }

  // Record one committed hop. Later hops by the same unit keep the first origin.
  noteMove(faction, sourcekey, sourceidx, destinationkey) {
    if (destinationkey === 'aeubox' || destinationkey === 'ceubox') {
      return false;
    }
    let space = this.mod.game.spaces[sourcekey];
    if (!space || !space.units || sourceidx < 0 || sourceidx >= space.units.length) {
      return false;
    }
    let unit = space.units[sourceidx];
    if (!unit) {
      return false;
    }
    let from = this.mod.returnSpaceNameForLog(sourcekey);
    let to = this.mod.returnSpaceNameForLog(destinationkey);
    let rows = this.pending();
    let existing = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].key === unit.key) {
        existing = rows[i];
        break;
      }
    }
    if (existing) {
      existing.to = to;
    } else {
      rows.push({
        key: unit.key,
        faction: faction,
        unit: this.label(unit.name),
        from: from,
        to: to
      });
    }
    return true;
  }

  commitMove(faction, sourcekey, sourceidx, destinationkey) {
    let combat = this.mod.game.state && this.mod.game.state.combat;
    if (
      combat &&
      combat.retreat_sourcekey === sourcekey &&
      combat.retreat_destinationkey === destinationkey
    ) {
      this.attachRetreat(faction, destinationkey);
      combat.retreat_sourcekey = '';
      combat.retreat_destinationkey = '';
      this.mod.moveUnit(sourcekey, sourceidx, destinationkey, false);
      return;
    }
    let tracked = this.noteMove(faction, sourcekey, sourceidx, destinationkey);
    this.mod.moveUnit(sourcekey, sourceidx, destinationkey, !tracked);
  }

  attachRetreat(faction, destinationkey) {
    let place = destinationkey;
    if (this.mod.returnSpaceNameForLog && this.mod.game.spaces && this.mod.game.spaces[destinationkey]) {
      place = this.mod.returnSpaceNameForLog(destinationkey);
    }
    let lists = [];
    if (this.mod.log && this.mod.log.logs) {
      lists.push(this.mod.log.logs);
    }
    if (this.mod.game && this.mod.game.log) {
      lists.push(this.mod.game.log);
    }
    let seen = [];
    for (let n = 0; n < lists.length; n++) {
      let list = lists[n];
      for (let i = 0; i < list.length; i++) {
        let entry = list[i];
        if (!entry || entry.type !== 'combat' || !entry.data) {
          continue;
        }
        let already = false;
        for (let s = 0; s < seen.length; s++) {
          if (seen[s] === entry.data) {
            already = true;
          }
        }
        if (already) {
          break;
        }
        seen.push(entry.data);
        if (!Array.isArray(entry.data.retreats)) {
          entry.data.retreats = [];
        }
        let found = false;
        for (let j = 0; j < entry.data.retreats.length; j++) {
          if (entry.data.retreats[j].place === place) {
            found = true;
          }
        }
        if (!found) {
          entry.data.retreats.push({ faction: faction, place: place });
        }
        break;
      }
    }
    if (this.mod.log && this.mod.log.rendered) {
      this.mod.log.render();
    }
  }

  flushIfBatchEnded() {
    let queue = this.mod.game.queue;
    let next = queue && queue.length ? queue[queue.length - 1] : '';
    let cmd = next ? String(next).split('\t')[0] : '';
    if (cmd !== 'move' && cmd !== 'control') {
      this.flush();
    }
  }

  flush() {
    let rows = this.mod.game.state.pending_movement_log;
    if (!rows || !rows.length) {
      return;
    }
    let groups = [];
    for (let i = 0; i < rows.length; i++) {
      let row = rows[i];
      let group = null;
      for (let j = 0; j < groups.length; j++) {
        if (groups[j].faction === row.faction) {
          group = groups[j];
          break;
        }
      }
      if (!group) {
        group = { faction: row.faction, hops: [] };
        groups.push(group);
      }
      group.hops.push({
        faction: row.faction,
        unit: row.unit,
        from: row.from,
        to: row.to
      });
    }
    this.mod.game.state.pending_movement_log = [];
    for (let i = 0; i < groups.length; i++) {
      let hops = groups[i].hops;
      let n = hops.length;
      let summary = this.sideName(groups[i].faction) + ' move ' + n + (n === 1 ? ' unit' : ' units');
      this.mod.updateLog(summary, 'movement', { hops: hops });
    }
  }

  combat() {
    if (!this.mod.game || !this.mod.game.state) {
      return null;
    }
    return this.mod.game.state.pending_combat_log || null;
  }

  openCombat() {
    let combat = this.mod.game.state.combat;
    if (!combat) {
      return null;
    }
    this.mod.game.state.pending_combat_log = {
      key: combat.key,
      location: this.mod.returnSpaceNameForLog(combat.key),
      attackerFaction: combat.attacking_faction,
      defenderFaction: combat.defending_faction,
      modifiers: [],
      cards: [],
      losses: [],
      retreats: [],
      flankFrom: this.mod.game.state.pending_flank_launch || '',
      notes: [],
      attackers: [],
      defenders: [],
      attackerCF: 0,
      defenderCF: 0,
      fortCF: 0,
      attackerTable: 'corps',
      defenderTable: 'corps',
      attack: null,
      defense: null,
      winner: 'none',
      flank: '',
      published: false
    };
    this.mod.game.state.pending_flank_launch = '';
    return this.mod.game.state.pending_combat_log;
  }

  // The flank announcement is queued as its own log line. Keep it on the combat record instead.
  absorbLog(str) {
    if (typeof str !== 'string') {
      return false;
    }
    let marker = 'Flank Attack launched from:';
    if (str.indexOf(marker) !== 0) {
      return false;
    }
    this.noteFlankLaunch(str.slice(marker.length).trim());
    return true;
  }

  noteFlankLaunch(from) {
    let name = from || '';
    if (name && this.mod.game.spaces && this.mod.game.spaces[name] && this.mod.returnSpaceNameForLog) {
      name = this.mod.returnSpaceNameForLog(name);
    }
    let rec = this.combat();
    if (rec) {
      rec.flankFrom = name;
      return true;
    }
    if (this.mod.game && this.mod.game.state) {
      this.mod.game.state.pending_flank_launch = name;
    }
    return true;
  }

  abandonCombat() {
    if (this.mod.game && this.mod.game.state) {
      this.mod.game.state.pending_combat_log = null;
    }
  }

  addModifier(text) {
    let rec = this.combat();
    if (!rec || !text) {
      return;
    }
    rec.modifiers.push(text);
  }

  recordCard(side, html) {
    let rec = this.combat();
    if (!rec || !html) {
      return;
    }
    rec.cards.push({ side: side, html: html });
  }

  note(text) {
    let rec = this.combat();
    if (!rec || !text) {
      return;
    }
    rec.notes.push(text);
  }

  // Casualties that currently become their own log lines, once fire has been recorded.
  noteLoss(text, faction) {
    let rec = this.combat();
    if (!rec || !rec.attack || !text) {
      return false;
    }
    rec.losses.push({ text: text, faction: faction || '' });
    return true;
  }

  unitCF(unit) {
    if (!unit || unit.destroyed) {
      return 0;
    }
    if (unit.moved) {
      return 0;
    }
    if (unit.damaged) {
      return unit.rcombat || 0;
    }
    return unit.combat || 0;
  }

  unitLine(unit, fromKey) {
    if (!unit || unit.destroyed) {
      return '';
    }
    let line = this.label(unit.name);
    if (fromKey) {
      line += ' (' + this.mod.returnSpaceNameForLog(fromKey) + ')';
    }
    line += ' ' + this.unitCF(unit);
    if (unit.damaged) {
      line += ', reduced';
    }
    if (unit.moved) {
      line += ', already moved';
    }
    return line;
  }

  terrainNotes(spacekey) {
    let space = this.mod.game.spaces[spacekey];
    let notes = [];
    if (!space) {
      return notes;
    }
    if (space.terrain == 'mountain') {
      notes.push('mountain: attack column -1');
    }
    if (space.terrain == 'swamp') {
      notes.push('swamp: attack column -1');
    }
    if (this.mod.game.state.combat.cancel_trench_effects == 1) {
      if (space.trench > 0) {
        notes.push('trench effects cancelled');
      }
    } else if (space.trench == 1) {
      notes.push('trench: attack column -1, defense column +1');
    } else if (space.trench == 2) {
      notes.push('trench: attack column -1, defense column +2');
    }
    return notes;
  }

  fireColumn(table, cf, shift) {
    let rows = table === 'corps' ? this.mod.returnCorpsFireTable() : this.mod.returnArmyFireTable();
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].max >= cf && rows[i].min <= cf) {
        let col = i + shift;
        if (col <= 0) {
          col = 1;
        }
        if (col >= rows.length) {
          col = rows.length - 1;
        }
        let band = rows[col];
        if (band.min === band.max) {
          return String(band.min);
        }
        return band.min + '-' + band.max;
      }
    }
    return '';
  }

  describeFire(side) {
    let combat = this.mod.game.state.combat;
    let attacking = side === 'attacker';
    let cf = attacking ? combat.attacker_cp_at_fire : combat.defender_cp_at_fire;
    let table = attacking ? combat.attacker_table : combat.defender_table;
    let shift = attacking ? combat.attacker_column_shift : combat.defender_column_shift;
    let roll = attacking ? combat.attacker_roll : combat.defender_roll;
    let drm = attacking ? combat.attacker_drm : combat.defender_drm;
    let modified = attacking ? combat.attacker_modified_roll : combat.defender_modified_roll;
    let hits = attacking ? combat.defender_loss_factor_at_fire : combat.attacker_loss_factor_at_fire;
    return {
      cf: cf,
      table: table || 'corps',
      shift: shift || 0,
      column: this.fireColumn(table, cf, shift || 0),
      roll: roll,
      drm: drm || 0,
      modified: modified,
      hits: hits
    };
  }

  captureFire() {
    let rec = this.combat();
    if (!rec) {
      rec = this.openCombat();
    }
    if (!rec) {
      return;
    }
    let combat = this.mod.game.state.combat;
    let attackers = this.mod.returnAttackerUnits();
    let defenders = this.mod.returnDefenderUnits();
    rec.attackers = [];
    for (let i = 0; i < attackers.length; i++) {
      let unit = attackers[i];
      if (unit && !unit.destroyed) {
        rec.attackers.push({ name: this.label(unit.name), cf: this.unitCF(unit) });
      }
    }
    rec.defenders = [];
    for (let i = 0; i < defenders.length; i++) {
      let unit = defenders[i];
      if (unit && !unit.destroyed) {
        rec.defenders.push({ name: this.label(unit.name), cf: this.unitCF(unit) });
      }
    }
    rec.attackerCF = combat.attacker_cp_at_fire;
    rec.defenderCF = combat.defender_cp_at_fire;
    rec.attackerTable = combat.attacker_table || 'corps';
    rec.defenderTable = combat.defender_table || 'corps';
    let unitCF = this.mod.returnDefenderCombatPower();
    rec.fortCF = rec.defenderCF - unitCF;
    if (rec.fortCF < 0) {
      rec.fortCF = 0;
    }
    let terrain = this.terrainNotes(combat.key);
    for (let i = 0; i < terrain.length; i++) {
      rec.modifiers.push(terrain[i]);
    }
    rec.attack = this.describeFire('attacker');
    rec.defense = this.describeFire('defender');
    rec.winner = combat.winner || 'none';
    rec.flank = combat.flank_attack || '';
  }

  resultText(winner, attackerFaction, defenderFaction) {
    if (winner === 'attacker') {
      return this.sideName(attackerFaction) + ' victory';
    }
    if (winner === 'defender') {
      return this.sideName(defenderFaction) + ' victory';
    }
    return 'mutual loss';
  }

  fireLine(label, fire) {
    if (!fire) {
      return '';
    }
    let line = label + ': ' + fire.cf + ' CF ' + fire.table;
    if (fire.column) {
      line += ' column ' + fire.column;
    }
    if (fire.shift) {
      line += ' (' + (fire.shift > 0 ? '+' : '') + fire.shift + ')';
    }
    line += ', roll ' + fire.roll;
    if (fire.drm) {
      line += ' (' + (fire.drm > 0 ? '+' : '') + fire.drm + ') = ' + fire.modified;
    }
    line += ', ' + fire.hits + (fire.hits === 1 ? ' hit' : ' hits');
    return line;
  }

  publishCombat() {
    let rec = this.combat();
    if (!rec || rec.published || !rec.attack) {
      return;
    }
    let combat = this.mod.game.state.combat;
    if (combat && combat.winner) {
      rec.winner = combat.winner;
    }
    rec.published = true;
    let attackerHits = rec.attack.hits;
    let defenderHits = rec.defense ? rec.defense.hits : 0;
    if (
      combat &&
      typeof combat.defender_loss_factor === 'number' &&
      typeof combat.attacker_loss_factor === 'number' &&
      (combat.defender_loss_factor !== attackerHits || combat.attacker_loss_factor !== defenderHits)
    ) {
      rec.notes.push(
        'after flank losses: ' + combat.defender_loss_factor + ' hits on the defender, ' + combat.attacker_loss_factor + ' hits on the attacker'
      );
      attackerHits = combat.defender_loss_factor;
      defenderHits = combat.attacker_loss_factor;
    }
    let result = this.resultText(rec.winner, rec.attackerFaction, rec.defenderFaction);
    let summary = this.sideName(rec.attackerFaction) + ' attack ' + rec.location;
    let data = {
      location: rec.location,
      attackerFaction: rec.attackerFaction,
      defenderFaction: rec.defenderFaction,
      attackers: rec.attackers,
      defenders: rec.defenders,
      attackerCF: rec.attackerCF,
      defenderCF: rec.defenderCF,
      attackerTable: rec.attackerTable,
      defenderTable: rec.defenderTable,
      fortCF: rec.fortCF,
      modifiers: rec.modifiers,
      cards: rec.cards,
      attack: rec.attack,
      defense: rec.defense,
      flank: rec.flank,
      flankFrom: rec.flankFrom || '',
      losses: rec.losses,
      retreats: rec.retreats || [],
      notes: rec.notes,
      winner: rec.winner,
      result: result,
      attackerHits: attackerHits,
      defenderHits: defenderHits
    };
    this.mod.game.state.pending_combat_log = null;
    this.mod.updateLog(summary, 'combat', data);
  }

  renderCombat(entries) {
    let entry = entries && entries[0];
    if (!entry) {
      return '';
    }
    let combat = entry.data;
    if (!combat || !combat.attack) {
      return entry.msg || '';
    }
    let html = '';
    if (combat.flankFrom) {
      html += this.bullet('Flank Attack launched from ' + combat.flankFrom);
    }
    if (combat.modifiers) {
      for (let i = 0; i < combat.modifiers.length; i++) {
        if (String(combat.modifiers[i]).toLowerCase().indexOf('flank') === 0) {
          html += this.bullet(combat.modifiers[i]);
        }
      }
    }
    html += this.section('ATTACKING');
    html += this.unitBullets(combat.attackers);
    html += this.section('DEFENDING');
    html += this.unitBullets(combat.defenders);
    if (combat.fortCF > 0) {
      html += this.bullet('fort - ' + combat.fortCF);
    }
    let attackerHits = typeof combat.attackerHits === 'number' ? combat.attackerHits : combat.attack.hits;
    let defenderHits = typeof combat.defenderHits === 'number' ? combat.defenderHits : combat.defense ? combat.defense.hits : 0;
    html += this.section('HITS');
    html += this.bullet(this.sideName(combat.attackerFaction) + ' - ' + attackerHits);
    html += this.bullet(this.sideName(combat.defenderFaction) + ' - ' + defenderHits);
    html += this.lossSections(combat.losses);
    html += this.section('RESULT');
    html += this.bullet(this.winText(combat));
    html += this.retreatBullets(combat);
    html = this.gap() + html + this.gap();
    return this.fold('pog-combat', this.attackSummary(entry.msg), html);
  }

  // Older rows stored "Central Powers attack Sedan — Central Powers victory (5-3)".
  attackSummary(msg) {
    let text = msg || '';
    let cut = text.indexOf(' — ');
    if (cut === -1) {
      cut = text.indexOf(' - ');
    }
    if (cut > 0) {
      return text.slice(0, cut);
    }
    return text;
  }

  gap() {
    return '<div class="pog-gap">&nbsp;</div>';
  }

  section(title) {
    return '<div class="pog-section">' + title + '</div>';
  }

  bullet(text) {
    return '<div>- ' + text + '</div>';
  }

  unitBullets(units) {
    let html = '';
    if (!units) {
      return html;
    }
    for (let i = 0; i < units.length; i++) {
      let unit = units[i];
      if (unit && typeof unit === 'object') {
        html += this.bullet(unit.name + ' - ' + unit.cf);
      } else if (unit) {
        html += this.bullet(unit);
      }
    }
    return html;
  }

  lossSections(losses) {
    let html = '';
    if (!losses || !losses.length) {
      return html;
    }
    let central = [];
    let allies = [];
    let other = [];
    for (let i = 0; i < losses.length; i++) {
      let loss = losses[i];
      let text = loss && typeof loss === 'object' ? loss.text : loss;
      let faction = loss && typeof loss === 'object' ? loss.faction : '';
      if (!text) {
        continue;
      }
      if (faction === 'central') {
        central.push(text);
      } else if (faction === 'allies') {
        allies.push(text);
      } else {
        other.push(text);
      }
    }
    html += this.lossBlock('LOSSES - CENTRAL', central);
    html += this.lossBlock('LOSSES - ALLIES', allies);
    html += this.lossBlock('LOSSES', other);
    return html;
  }

  lossBlock(title, rows) {
    if (!rows.length) {
      return '';
    }
    let html = this.section(title);
    for (let i = 0; i < rows.length; i++) {
      html += this.bullet(rows[i]);
    }
    return html;
  }

  winText(combat) {
    if (combat.winner === 'attacker') {
      return this.sideName(combat.attackerFaction) + ' win';
    }
    if (combat.winner === 'defender') {
      return this.sideName(combat.defenderFaction) + ' win';
    }
    return 'mutual loss';
  }

  retreatBullets(combat) {
    let html = '';
    let retreats = combat.retreats || [];
    if (!retreats.length) {
      return html;
    }
    let places = [];
    let faction = combat.defenderFaction;
    for (let i = 0; i < retreats.length; i++) {
      if (retreats[i].faction) {
        faction = retreats[i].faction;
      }
      if (retreats[i].place && places.indexOf(retreats[i].place) === -1) {
        places.push(retreats[i].place);
      }
    }
    if (!places.length) {
      return html;
    }
    return this.bullet(this.sideName(faction) + ' retreat to ' + places.join(', '));
  }

  renderMovement(entries) {
    let entry = entries && entries[0];
    if (!entry) {
      return '';
    }
    let hops = entry.data && entry.data.hops;
    if (!Array.isArray(hops) || !hops.length) {
      return entry.msg || '';
    }
    let rows = '';
    for (let i = 0; i < hops.length; i++) {
      rows += '<div>' + hops[i].unit + ' (' + hops[i].from + ' -> ' + hops[i].to + ')</div>';
    }
    return this.fold('pog-movement', entry.msg, rows);
  }

  // The shared log prefixes every row with ">". A block-level disclosure then
  // drops onto the next line, so the filled caret has to take that column itself.
  // Clicks on the summary stay with the disclosure. Clicks on the body reach the log.
  fold(kind, summary, body) {
    return (
      '<details class="pog-log ' +
      kind +
      '"><summary>' +
      summary +
      '</summary>' +
      body +
      '</details>'
    );
  }
}

module.exports = PathsLog;
