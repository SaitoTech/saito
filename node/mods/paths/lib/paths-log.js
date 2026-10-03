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
  note(faction, sourcekey, sourceidx, destinationkey) {
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
    let tracked = this.note(faction, sourcekey, sourceidx, destinationkey);
    this.mod.moveUnit(sourcekey, sourceidx, destinationkey, !tracked);
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
    return this.mod.game.state.pending_combat_log;
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
  noteLoss(text) {
    let rec = this.combat();
    if (!rec || !rec.attack || !text) {
      return false;
    }
    rec.losses.push(text);
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
      let line = this.unitLine(unit, unit.spacekey);
      if (line) {
        rec.attackers.push(line);
      }
    }
    rec.defenders = [];
    for (let i = 0; i < defenders.length; i++) {
      let line = this.unitLine(defenders[i], '');
      if (line) {
        rec.defenders.push(line);
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
    let summary =
      this.sideName(rec.attackerFaction) +
      ' attack ' +
      rec.location +
      ' — ' +
      result +
      ' (' +
      attackerHits +
      '-' +
      defenderHits +
      ')';
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
      losses: rec.losses,
      notes: rec.notes,
      winner: rec.winner,
      result: result
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
    html += '<div>ATTACK</div>';
    html +=
      '<div>' +
      this.sideName(combat.attackerFaction) +
      ' — ' +
      combat.attackerCF +
      ' CF (' +
      combat.attackerTable +
      ')</div>';
    for (let i = 0; i < combat.attackers.length; i++) {
      html += '<div>' + combat.attackers[i] + '</div>';
    }
    html += '<div>DEFENSE</div>';
    html +=
      '<div>' +
      this.sideName(combat.defenderFaction) +
      ' — ' +
      combat.defenderCF +
      ' CF (' +
      combat.defenderTable +
      ')</div>';
    for (let i = 0; i < combat.defenders.length; i++) {
      html += '<div>' + combat.defenders[i] + '</div>';
    }
    if (combat.fortCF > 0) {
      html += '<div>fort +' + combat.fortCF + '</div>';
    }
    if ((combat.modifiers && combat.modifiers.length) || (combat.cards && combat.cards.length) || combat.flank) {
      html += '<div>MODIFIERS</div>';
      for (let i = 0; i < combat.modifiers.length; i++) {
        html += '<div>' + combat.modifiers[i] + '</div>';
      }
      for (let i = 0; i < combat.cards.length; i++) {
        let who = combat.cards[i].side === 'defender' ? 'Defender' : 'Attacker';
        html += '<div>' + who + ' plays ' + combat.cards[i].html + '</div>';
      }
      if (combat.flank === 'attacker') {
        html += '<div>flank attack: attacker fires first</div>';
      } else if (combat.flank === 'defender') {
        html += '<div>flank attack: defender fires first</div>';
      }
    }
    html += '<div>FIRE</div>';
    html += '<div>' + this.fireLine('Attack', combat.attack) + '</div>';
    html += '<div>' + this.fireLine('Defense', combat.defense) + '</div>';
    if (combat.losses && combat.losses.length) {
      html += '<div>LOSSES</div>';
      for (let i = 0; i < combat.losses.length; i++) {
        html += '<div>' + combat.losses[i] + '</div>';
      }
    }
    html += '<div>RESULT</div>';
    html += '<div>' + combat.result + '</div>';
    for (let i = 0; i < combat.notes.length; i++) {
      html += '<div>' + combat.notes[i] + '</div>';
    }
    return (
      '<details class="pog-combat" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onmouseup="event.stopPropagation()"><summary>' +
      entry.msg +
      '</summary>' +
      html +
      '</details>'
    );
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
    return (
      '<details class="pog-movement" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onmouseup="event.stopPropagation()"><summary>' +
      entry.msg +
      '</summary>' +
      rows +
      '</details>'
    );
  }
}

module.exports = PathsLog;
