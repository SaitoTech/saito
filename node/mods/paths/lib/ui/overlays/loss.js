const LossTemplate = require('./loss.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class LossOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.visible = false;
    this.overlay = new SaitoOverlay(app, mod, true, true, false);
    this.assignment_faction = '';
    this.i_am_assigning = false;
    this.faction = '';
    this.units = null;
    this.loss_factor = 0;
    this.starting_units = null;
    this.starting_loss_factor = null;
    this.moves = [];
    this.number_of_hits_assignable_attacker_units = 0;
    this.number_of_hits_assignable_defender_units = 0;
    this.sole_attacker_unit = null;
    this.sole_defender_unit = null;
    this.sole_attacker_unit_id = null;
    this.sole_defender_unit_id = null;
    this.sole_defender_unit_id = null;
    this.my_hits_auto_assigned = 0;
    this.hits_already_assigned = 0;
    this.priority_hits_required = 0;
    this.are_any_units_unassignable = 0;
  }

  show() {
    this.overlay.show();
  }

  hide() {
    this.overlay.hide();
  }

  canTakeMoreLosses() {
    if (this.loss_factor == 0) {
      return false;
    }

    let x = [];
    for (let i = 0; i < this.units.length; i++) {
      x.push([]);
      if (this.units[i].damaged == false) {
        x[i].push(this.units[i].loss);
      } else {
        if (this.units[i].destroyed == false) {
          x[i].push(this.units[i].rloss);
          if (this.units[i].key.indexOf('army') > 0) {
            try {
              let corpskey = this.units[i].key.split('_')[0] + '_corps';
              let cunit = this.mod.cloneUnit(corpskey);
              x[i].push(cunit.loss);
              x[i].push(cunit.rloss);
            } catch (err) {
              // some armies cannot be reduced to corps
            }
          }
        }
      }
    }

    for (let i = 0; i < x.length; i++) {
      if (this.loss_factor >= x[i][0]) {
        return true;
      }
    }

    return false;
  }

  showRetreatNotice() {
    // update the UI to show any hits taken
    this.render(this.faction || this.assignment_faction || 'defender');
    try {
      this.updateInstructions(
        `<div class="continue_btn">All possible damage assigned — <span style="text-decoration:underline dashed;cursor:pointer">Close to Continue</span></div>`,
        'resolved'
      );
      let btn = document.querySelector('.loss-overlay .continue_btn');
      if (btn) {
        btn.onclick = (e) => {
          this.hide();
        };
      }
    } catch (err) {}
  }

  viewingPlayerPower() {
    return this.mod.returnFactionOfPlayer() || '';
  }

  activeAssigningPower() {
    let combat = this.mod.game.state.combat;
    if (!combat) {
      return '';
    }
    let side = this.assignment_faction || this.faction || '';
    if (side === 'attacker') {
      return combat.attacker_power;
    }
    if (side === 'defender') {
      return combat.defender_power;
    }
    return '';
  }

  // Header color/icon = viewing player's faction (not attacker/defender/assigner).
  syncActiveHeader(power = '') {
    let status = document.querySelector('.loss-overlay .loss-overlay-status');
    let icon = document.querySelector('.loss-overlay .loss-overlay-status-icon');
    if (!power) {
      power = this.viewingPlayerPower();
    }
    if (status) {
      status.classList.remove('is-central', 'is-allies');
      if (power === 'central') {
        status.classList.add('is-central');
      } else if (power) {
        status.classList.add('is-allies');
      }
    }
    if (icon) {
      icon.dataset.faction = power || '';
    }
  }

  updateInstructions(msg = '', mode = '') {
    let status = document.querySelector('.loss-overlay .loss-overlay-status');
    let copy = document.querySelector('.loss-overlay .loss-overlay-status-copy');
    if (!status || !copy) {
      return;
    }

    let resolved =
      mode === 'resolved' ||
      /automatically assigned|all possible damage|combat resolved/i.test(String(msg));
    let action =
      mode === 'action' ||
      (!resolved && this.i_am_assigning && /assign/i.test(String(msg)));
    let waiting = mode === 'waiting' || (!resolved && !action);

    status.classList.toggle('is-resolved', resolved);
    status.classList.toggle('is-action', action && !resolved);
    status.classList.toggle('is-waiting', waiting && !resolved);

    this.syncActiveHeader();

    // Title stays "Assign losses" during the assignment phase (action or waiting);
    // subtitle carries who is assigning / how much.
    let title = resolved ? 'Combat resolved' : 'Assign losses';
    if (/take additional hit/i.test(String(msg))) {
      title = 'Cancel retreat?';
    }

    copy.innerHTML = `<strong>${title}</strong><span class="status-sub">${msg}</span>`;
  }

  summarizeForce(units = []) {
    let armies = 0;
    let corps = 0;
    for (let i = 0; i < units.length; i++) {
      if (units[i].destroyed) {
        continue;
      }
      if (units[i].army || (units[i].key && units[i].key.indexOf('army') > -1)) {
        armies++;
      } else {
        corps++;
      }
    }
    let parts = [];
    if (armies > 0) {
      parts.push(`${armies} Arm${armies === 1 ? 'y' : 'ies'}`);
    }
    if (corps > 0) {
      parts.push(`${corps} Corps`);
    }
    return parts.length ? parts.join(', ') : 'No units';
  }

  terrainIcon(terrain = '') {
    if (terrain === 'forest') {
      return '🌲';
    }
    if (terrain === 'mountain') {
      return '⛰';
    }
    if (terrain === 'swamp') {
      return '🌿';
    }
    if (terrain === 'desert') {
      return '☀';
    }
    return '⚔';
  }

  fireSnapshot() {
    let c = this.mod.game.state.combat;
    return {
      attacker_cp:
        c.attacker_cp_at_fire != null ? c.attacker_cp_at_fire : c.attacker_cp,
      defender_cp:
        c.defender_cp_at_fire != null ? c.defender_cp_at_fire : c.defender_cp,
      attacker_hits:
        c.attacker_loss_factor_at_fire != null
          ? c.attacker_loss_factor_at_fire
          : c.attacker_loss_factor,
      defender_hits:
        c.defender_loss_factor_at_fire != null
          ? c.defender_loss_factor_at_fire
          : c.defender_loss_factor
    };
  }

  fillPresentationChrome(attacker_units, defender_units) {
    let combat = this.mod.game.state.combat;
    let space = this.mod.game.spaces[combat.key];
    let snap = this.fireSnapshot();
    let terrain = space.terrain || 'clear';
    let show_terrain =
      !!terrain && terrain !== 'normal' && terrain !== 'clear';
    let show_fort = space.fort > 0;

    let title = document.querySelector('.loss-overlay .loss-overlay-title');
    let space_name = this.mod.returnSpaceName(combat.key);
    let attacker_label =
      combat.attacker_power === 'central' ? 'Central Powers' : 'Allied Powers';
    if (title) {
      title.innerHTML = `Combat at ${space_name} - ${attacker_label} attack`;
    }

    let terrain_item = document.querySelector('.loss-overlay .loss-overlay-terrain-item');
    let fort_item = document.querySelector('.loss-overlay .loss-overlay-fort-item');
    let terrain_name = document.querySelector('.loss-overlay .loss-overlay-terrain-name');
    let fort_name = document.querySelector('.loss-overlay .loss-overlay-fort-name');
    if (terrain_item && terrain_name) {
      if (show_terrain) {
        terrain_name.innerHTML = terrain;
        terrain_item.hidden = false;
      } else {
        terrain_name.innerHTML = '';
        terrain_item.hidden = true;
      }
    }
    if (fort_item && fort_name) {
      if (show_fort) {
        fort_name.innerHTML = 'Fortified';
        fort_item.hidden = false;
      } else {
        fort_name.innerHTML = '';
        fort_item.hidden = true;
      }
    }

    let attacker_panel = document.querySelector('.loss-overlay .attacker-panel');
    let defender_panel = document.querySelector('.loss-overlay .defender-panel');
    if (attacker_panel) {
      attacker_panel.classList.remove('is-central', 'is-allies');
      attacker_panel.classList.add(
        combat.attacker_power === 'central' ? 'is-central' : 'is-allies'
      );
    }
    if (defender_panel) {
      defender_panel.classList.remove('is-central', 'is-allies');
      defender_panel.classList.add(
        combat.defender_power === 'central' ? 'is-central' : 'is-allies'
      );
    }

    // Orient panels from the local player's perspective: own side left, opponent right.
    let body = document.querySelector('.loss-overlay .loss-overlay-body');
    let my_power = this.viewingPlayerPower();
    if (body) {
      body.classList.toggle(
        'own-side-left',
        my_power === combat.defender_power
      );
    }

    let a_hits = document.querySelector('.loss-overlay .attacker-hits-count');
    let d_hits = document.querySelector('.loss-overlay .defender-hits-count');
    // Hits = damage this side generated against the opponent (not hits they absorb)
    if (a_hits) {
      a_hits.innerHTML = snap.defender_hits;
    }
    if (d_hits) {
      d_hits.innerHTML = snap.attacker_hits;
    }

    this.syncActiveHeader();

    let details_btn = document.querySelector('.loss-overlay .loss-overlay-see-details');
    let details = document.querySelector('.loss-overlay .loss-overlay-details');
    let toggleDetails = (open) => {
      if (!details) {
        return;
      }
      details.classList.toggle('is-open', open);
      details.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (details_btn) {
        details_btn.classList.toggle('is-open', open);
        details_btn.setAttribute(
          'aria-label',
          open ? 'Hide combat details' : 'Show combat details'
        );
      }
    };
    if (details_btn) {
      details_btn.onclick = (e) => {
        e.preventDefault();
        toggleDetails(!details.classList.contains('is-open'));
      };
    }
  }

  factionLabel(power = '') {
    return power === 'central' ? 'Central Powers' : 'Allied Powers';
  }

  formatRollModifier(roll, drm) {
    let mod = parseInt(drm) || 0;
    let op = mod >= 0 ? '+' : '-';
    let abs = Math.abs(mod);
    return `<span class="calc-roll">${roll}</span><span class="calc-op">${op}</span><span class="calc-mod">${abs}</span>`;
  }

  // Exact content crops from dice.png (1536×1024). Each face is a 224×224 square
  // centered on the non-transparent die art (not the full 256×512 grid cell).
  // red/central row y≈236; blue/allies row y≈556.
  dieSourceRect(face, power = 'central') {
    const CROP = 224;
    // [x, y] top-left of 224×224 source rectangle for faces 1–6
    const central = [
      [30, 236],
      [282, 236],
      [532, 236],
      [782, 236],
      [1031, 236],
      [1281, 236]
    ];
    const allies = [
      [31, 556],
      [282, 556],
      [532, 556],
      [782, 556],
      [1031, 556],
      [1281, 556]
    ];
    let f = parseInt(face) || 1;
    if (f < 1) {
      f = 1;
    }
    if (f > 6) {
      f = 6;
    }
    let xy = (power === 'central' ? central : allies)[f - 1];
    return { x: xy[0], y: xy[1], w: CROP, h: CROP, sheet_w: 1536, sheet_h: 1024 };
  }

  setDieSprite(el, face, power = 'central') {
    if (!el) {
      return;
    }
    let f = parseInt(face) || 1;
    if (f < 1) {
      f = 1;
    }
    if (f > 6) {
      f = 6;
    }
    let src = this.dieSourceRect(f, power);
    el.classList.add('loss-overlay-die-sprite');
    el.classList.toggle('is-central', power === 'central');
    el.classList.toggle('is-allies', power !== 'central');
    el.style.setProperty('--die-src-x', String(src.x));
    el.style.setProperty('--die-src-y', String(src.y));
    el.style.setProperty('--die-crop', String(src.w));
    el.style.setProperty('--die-sheet-w', String(src.sheet_w));
    el.style.setProperty('--die-sheet-h', String(src.sheet_h));
    el.setAttribute('aria-label', `${this.factionLabel(power)} rolled ${f}`);
  }

  fireColumnLabel(entry) {
    if (!entry) {
      return '-';
    }
    if (entry.max >= 100) {
      return `${entry.min}+`;
    }
    if (entry.min === entry.max) {
      return String(entry.min);
    }
    return `${entry.min}–${entry.max}`;
  }

  resolveFireColumn(hits = [], cp = 0, shift = 0) {
    let base = 0;
    for (let i = hits.length - 1; i >= 0; i--) {
      if (hits[i].max >= cp && hits[i].min <= cp) {
        base = i;
        break;
      }
    }
    let col = base + (parseInt(shift) || 0);
    if (col < 0) {
      col = 0;
    }
    if (col >= hits.length) {
      col = hits.length - 1;
    }
    return {
      base,
      col,
      base_label: this.fireColumnLabel(hits[base]),
      column_label: this.fireColumnLabel(hits[col]),
      result: hits[col] ? hits[col] : null
    };
  }

  buildFireTableHtml(hits = [], selected_col = 0, selected_roll = 1, accent = 'red') {
    let head = `<thead><tr><th class="roll-head">Roll</th>`;
    for (let c = 0; c < hits.length; c++) {
      head += `<th class="${c === selected_col ? 'is-selected-col' : ''}">${this.fireColumnLabel(hits[c])}</th>`;
    }
    head += `</tr></thead>`;

    let body = `<tbody>`;
    for (let roll = 1; roll <= 6; roll++) {
      body += `<tr class="${roll === selected_roll ? 'is-selected-row' : ''}">`;
      body += `<th class="roll-label">${roll}</th>`;
      for (let c = 0; c < hits.length; c++) {
        let val = hits[c][roll];
        let cell = val === undefined || val === null ? '—' : val;
        let cls = [];
        if (c === selected_col) {
          cls.push('is-selected-col');
        }
        if (roll === selected_roll) {
          cls.push('is-selected-row');
        }
        if (c === selected_col && roll === selected_roll) {
          cls.push('is-result-cell');
        }
        body += `<td class="${cls.join(' ')}">${cell === 0 ? '—' : cell}</td>`;
      }
      body += `</tr>`;
    }
    body += `</tbody>`;

    return `<div class="pog-fire-table-wrap accent-${accent}"><table class="pog-fire-table">${head}${body}</table></div>`;
  }

  buildFireCalcBlock(opts = {}) {
    let drm = parseInt(opts.drm) || 0;
    let drm_text = drm === 0 ? '0' : drm > 0 ? `+${drm}` : `−${Math.abs(drm)}`;
    let column_text = opts.column_label;
    if (opts.shift && opts.base_label !== opts.column_label) {
      column_text = `${opts.column_label} <span class="calc-muted">(from ${opts.base_label})</span>`;
    }
    let notes = '';
    if (opts.notes && opts.notes.length) {
      notes = `<ul class="fire-calc-notes">${opts.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`;
    }

    return `
      <section class="fire-calc ${opts.accent}">
        <h3 class="fire-calc-title">${opts.title}</h3>
        <div class="fire-calc-layout">
          <dl class="fire-calc-summary">
            <div><dt>Combat Strength</dt><dd>${opts.cp}</dd></div>
            <div><dt>Fire Table</dt><dd>${opts.table_name}</dd></div>
            <div><dt>Column</dt><dd>${column_text}</dd></div>
            <div><dt>Die Roll</dt><dd>${opts.roll}</dd></div>
            <div><dt>Modifier</dt><dd>${drm_text}</dd></div>
            <div><dt>Modified Roll</dt><dd>${opts.modified_roll}</dd></div>
            <div class="fire-calc-result"><dt>Result</dt><dd>${opts.hits} hits</dd></div>
          </dl>
          <div class="fire-calc-table">
            <div class="fire-calc-table-label">${opts.table_name} Fire Table</div>
            ${this.buildFireTableHtml(opts.hits_table, opts.column_index, opts.modified_roll, opts.accent)}
          </div>
        </div>
        ${notes}
      </section>
    `;
  }

  fillCalculationDetails() {
    let combat = this.mod.game.state.combat;
    let space = this.mod.game.spaces[combat.key];
    let snap = this.fireSnapshot();
    let fires = document.querySelector('.loss-overlay .loss-overlay-calc-fires');
    let notes_el = document.querySelector('.loss-overlay .loss-overlay-calc-notes');
    if (!fires || !notes_el) {
      return;
    }

    let attacker_cp = parseInt(snap.attacker_cp);
    let defender_cp = parseInt(snap.defender_cp);
    if (isNaN(attacker_cp)) {
      attacker_cp = parseInt(combat.attacker_strength) || 0;
    }
    if (isNaN(defender_cp)) {
      defender_cp = parseInt(combat.defender_strength) || 0;
    }

    let attacker_hits_table =
      combat.attacker_table === 'corps'
        ? this.mod.returnCorpsFireTable()
        : this.mod.returnArmyFireTable();
    let defender_hits_table =
      combat.defender_table === 'corps'
        ? this.mod.returnCorpsFireTable()
        : this.mod.returnArmyFireTable();

    let attacker_col = this.resolveFireColumn(
      attacker_hits_table,
      attacker_cp,
      combat.attacker_column_shift
    );
    let defender_col = this.resolveFireColumn(
      defender_hits_table,
      defender_cp,
      combat.defender_column_shift
    );

    let attacker_accent = combat.attacker_power === 'central' ? 'red' : 'blue';
    let defender_accent = combat.defender_power === 'central' ? 'red' : 'blue';

    let attacker_notes = [];
    let defender_notes = [];
    let a_shift = parseInt(combat.attacker_column_shift) || 0;
    let d_shift = parseInt(combat.defender_column_shift) || 0;
    if (a_shift !== 0) {
      attacker_notes.push(
        `Column shift ${a_shift > 0 ? '+' : ''}${a_shift} applied to attacker fire.`
      );
    }
    if (d_shift !== 0) {
      defender_notes.push(
        `Column shift ${d_shift > 0 ? '+' : ''}${d_shift} applied to defender fire.`
      );
    }
    if (space.fort > 0 && snap.defender_cp != null) {
      defender_notes.push(`Fort strength included in defender combat power used for fire.`);
    }

    // Attacker fire → hits on defender; defender fire → hits on attacker
    fires.innerHTML =
      this.buildFireCalcBlock({
        title: `${this.factionLabel(combat.attacker_power)} Fire`,
        accent: attacker_accent,
        cp: attacker_cp,
        table_name: combat.attacker_table === 'corps' ? 'Corps' : 'Army',
        column_label: attacker_col.column_label,
        base_label: attacker_col.base_label,
        shift: a_shift,
        column_index: attacker_col.col,
        roll: combat.attacker_roll,
        drm: combat.attacker_drm,
        modified_roll: combat.attacker_modified_roll,
        hits: snap.defender_hits,
        hits_table: attacker_hits_table,
        notes: attacker_notes
      }) +
      this.buildFireCalcBlock({
        title: `${this.factionLabel(combat.defender_power)} Fire`,
        accent: defender_accent,
        cp: defender_cp,
        table_name: combat.defender_table === 'corps' ? 'Corps' : 'Army',
        column_label: defender_col.column_label,
        base_label: defender_col.base_label,
        shift: d_shift,
        column_index: defender_col.col,
        roll: combat.defender_roll,
        drm: combat.defender_drm,
        modified_roll: combat.defender_modified_roll,
        hits: snap.attacker_hits,
        hits_table: defender_hits_table,
        notes: defender_notes
      });

    let note_bits = [];
    let terrain = space.terrain || 'clear';
    if (terrain && terrain !== 'normal' && terrain !== 'clear') {
      note_bits.push(`Terrain: <strong>${terrain}</strong>`);
    } else {
      note_bits.push(`Terrain: <strong>clear</strong>`);
    }
    if (space.trench > 0) {
      note_bits.push(`Trench level <strong>${space.trench}</strong>`);
    }
    if (space.fort > 0) {
      note_bits.push(`Fort <strong>${space.fort}</strong>`);
    } else if (space.fort == -1) {
      note_bits.push(`Fort destroyed`);
    }
    if (combat.flank_attack) {
      note_bits.push(
        `Flank attack (${combat.flank_attack === 'attacker' ? 'attacker success' : 'defender success'})`
      );
    }

    let cards = [];
    for (let z = 0; z < this.mod.game.state.cc_allies_active.length; z++) {
      cards.push(this.mod.popup(this.mod.game.state.cc_allies_active[z]));
    }
    for (let z = 0; z < this.mod.game.state.cc_central_active.length; z++) {
      cards.push(this.mod.popup(this.mod.game.state.cc_central_active[z]));
    }
    if (cards.length) {
      note_bits.push(`Combat cards: ${cards.join(' ')}`);
    }

    notes_el.innerHTML = note_bits.length
      ? `<div class="calc-context">${note_bits.map((b) => `<div>${b}</div>`).join('')}</div>`
      : '';
  }

  unitLocationLabel(unit) {
    let spacekey = unit.spacekey;
    if (this.mod.game.spaces[spacekey] && this.mod.game.spaces[spacekey].name) {
      return this.mod.game.spaces[spacekey].name;
    }
    return spacekey || '\u00a0';
  }

  isCorpsUnit(unit) {
    if (!unit) {
      return false;
    }
    // Prefer key — reliable for freshly cloned replacement corps after army loss
    if (unit.key && unit.key.indexOf('army') > -1) {
      return false;
    }
    if (unit.key && unit.key.indexOf('corps') > -1) {
      return true;
    }
    if (unit.corps) {
      return true;
    }
    if (unit.army) {
      return false;
    }
    return false;
  }

  applyUnitTypeClass(el, unit) {
    if (!el) {
      return;
    }
    let corps = this.isCorpsUnit(unit);
    el.classList.toggle('is-corps', corps);
    el.classList.toggle('is-army', !corps);
    if (unit && unit.key) {
      el.dataset.key = unit.key;
    }
  }

  unitTokenInnerHtml(unit, mouseout_first = false) {
    let img = this.mod.returnUnitImageWithMouseoverOfStepwiseLoss(unit, false, mouseout_first);
    let loc = this.unitLocationLabel(unit);
    return `<div class="loss-overlay-unit-token">${img}</div><div class="loss-overlay-unit-spacekey">${loc}</div>`;
  }

  unitCardHtml(unit, idx, mouseout_first = false) {
    let key = unit.key;
    let spacekey = unit.spacekey;
    let damaged = unit.damaged ? 1 : 0;
    let type_class = this.isCorpsUnit(unit) ? 'is-corps' : 'is-army';
    return `<div class="loss-overlay-unit ${type_class}" data-spacekey="${spacekey}" data-key="${key}" data-damaged="${damaged}" id="${idx}">${this.unitTokenInnerHtml(unit, mouseout_first)}</div>`;
  }


  renderToAssignAdditionalStepwiseLoss(faction = '') {
    let qs_defender = '.loss-overlay .units.defender';
    let defender_units = this.mod.returnDefenderUnits();
    let attacker_units = this.mod.returnAttackerUnits();
    this.units = defender_units;
    let terrain = this.mod.game.spaces[this.mod.game.state.combat.key].terrain;

    this.moves = [];
    this.number_of_hits_assignable_defender_units = 0;
    this.sole_defender_unit = null;
    this.sole_defender_unit_id = null;
    this.assignment_faction = 'defender';
    this.i_am_assigning = true;
    this.faction = 'defender';

    for (let i = 0; i < defender_units.length; i++) {
      if (!defender_units[i].destroyed) {
        this.number_of_hits_assignable_defender_units++;
        this.sole_defender_unit = defender_units[i];
        this.sole_defender_unit_id = i;
      }
    }

    // one eligible unit: apply the extra step without the picker overlay
    // a reduced sole defender is the last step and cannot be eliminated to cancel the retreat
    if (this.number_of_hits_assignable_defender_units == 1 && this.sole_defender_unit) {
      if (this.sole_defender_unit.damaged) {
        this.mod.playerHandleRetreat();
        return;
      }
      this.loss_factor = 0;
      this.assignHitToUnit(
        this.sole_defender_unit,
        this.sole_defender_unit.spacekey,
        this.sole_defender_unit.key,
        this.sole_defender_unit_id,
        null,
        false,
        qs_defender,
        'defender',
        true
      );
      return;
    }

    this.overlay.show(LossTemplate(terrain));
    this.fillPresentationChrome(attacker_units, defender_units);
    this.fillCalculationDetails();
    this.updateInstructions('Defender — Take Additional Hit to Cancel Retreat', 'action');

    for (let i = 0; i < defender_units.length; i++) {
      if (defender_units[i].destroyed) {
        continue;
      }
      this.app.browser.addElementToSelector(this.unitCardHtml(defender_units[i], i), qs_defender);
    }

    this.loss_factor = 0;
    this.attachEvents(false, qs_defender, 'defender', true);
  }


  render(faction = '') {
    this.faction = faction;
    this.assignment_faction = faction;

    let am_i_the_attacker = false;

    let space = this.mod.game.spaces[this.mod.game.state.combat.key];
    let terrain = space.terrain;
    let attacker_units;
    let defender_units;
    this.number_of_hits_assignable_attacker_units = 0;
    this.number_of_hits_assignable_defender_units = 0;
    this.my_hits_auto_assigned = 0;
    this.hits_already_assigned = 0;

    let qs_attacker = '.loss-overlay .units.attacker';
    let qs_defender = '.loss-overlay .units.defender';
    let my_qs = '.loss-overlay .units.defender';

    attacker_units = this.mod.returnAttackerUnits();
    defender_units = this.mod.returnDefenderUnits();

    this.units = defender_units;

    if (faction == this.mod.game.state.combat.attacking_faction || faction === 'attacker') {
      am_i_the_attacker = true;
      my_qs = '.loss-overlay .units.attacker';
      this.units = attacker_units;
    }

    if (am_i_the_attacker) {
      this.starting_units = JSON.parse(JSON.stringify(attacker_units));
      this.starting_loss_factor = this.mod.game.state.combat.attacker_loss_factor;
      this.loss_factor = this.starting_loss_factor;
    } else {
      this.starting_units = JSON.parse(JSON.stringify(defender_units));
      this.starting_loss_factor = this.mod.game.state.combat.defender_loss_factor;
      this.loss_factor = this.starting_loss_factor;
    }

    for (let z = 0; z < this.units.length; z++) {
      if (this.units[z].damaged_this_combat) {
        this.hits_already_assigned = 1;
      }
    }

    this.moves = [];

    this.overlay.show(LossTemplate(terrain));

    for (let i = 0; i < attacker_units.length; i++) {
      if (!attacker_units[i].destroyed) {
        this.app.browser.addElementToSelector(this.unitCardHtml(attacker_units[i], i), qs_attacker);
        this.number_of_hits_assignable_attacker_units++;
        this.sole_attacker_unit = attacker_units[i];
        this.sole_attacker_unit_id = i;
      }
    }

    for (let i = 0; i < defender_units.length; i++) {
      if (!defender_units[i].destroyed) {
        this.app.browser.addElementToSelector(this.unitCardHtml(defender_units[i], i), qs_defender);
        this.number_of_hits_assignable_defender_units++;
        this.sole_defender_unit = defender_units[i];
        this.sole_defender_unit_id = i;
      }
    }

    this.fillPresentationChrome(attacker_units, defender_units);
    this.fillCalculationDetails();

    let am_iii_the_attacker = false;
    if (
      this.mod.game.player ==
      this.mod.returnPlayerOfFaction(this.mod.game.state.combat.attacker_power)
    ) {
      am_iii_the_attacker = true;
    }

    this.i_am_assigning =
      (am_iii_the_attacker && faction == 'attacker') ||
      (!am_iii_the_attacker && faction == 'defender');

    let snap = this.fireSnapshot();
    let assigning_power =
      faction == 'attacker'
        ? this.mod.game.state.combat.attacker_power
        : this.mod.game.state.combat.defender_power;
    let assigning_name =
      assigning_power === 'central' ? 'Central Powers' : 'Allied Powers';
    let live_hits =
      faction == 'attacker'
        ? this.mod.game.state.combat.attacker_loss_factor
        : this.mod.game.state.combat.defender_loss_factor;
    let at_fire_hits =
      faction == 'attacker' ? snap.attacker_hits : snap.defender_hits;
    let flank_note = '';
    if (live_hits != at_fire_hits) {
      flank_note = ` (flank-adjusted from ${at_fire_hits})`;
    }

    if (this.i_am_assigning) {
      this.updateInstructions(
        `${assigning_name} — Assign ${this.loss_factor} Damage Now${flank_note}`,
        'action'
      );
    } else {
      this.updateInstructions(
        `${assigning_name} assigning ${live_hits} hits${flank_note}`,
        'waiting'
      );
    }

    if (am_iii_the_attacker == 1 && faction == 'attacker') {
      this.attachEvents(am_i_the_attacker, my_qs, faction);
    }
    if (am_iii_the_attacker == 0 && faction == 'defender') {
      this.attachEvents(am_i_the_attacker, my_qs, faction);
    }
  }

  highlightFiringTable() {
    // Legacy no-op: details highlighting is handled by fillCalculationDetails().
  }

  assignHitToUnit(
    unit,
    unit_spacekey,
    unit_key,
    idx,
    el = null,
    am_i_the_attacker,
    my_qs,
    faction,
    just_one_more_hit
  ) {
    let paths_self = this.mod;

    console.log('assign hit to unit...');

    //
    // prevents auto-assigning next hit if only 1 unit left
    //
    this.hits_already_assigned = 1;

    //if (unit.destroyed) { alert("destroyed"); }

    let didx = idx;
    let unit_idx = didx;

    //
    // withdrawal
    //
    if (
      unit.corps &&
      unit.eligible_for_withdrawal_bonus &&
      paths_self.game.state.events.withdrawal &&
      paths_self.game.state.events.withdrawal_bonus_used != 1
    ) {
      try {
        salert('Withdrawal Negates 1 Corps Stepwise Loss...');
      } catch (err) {}
      if (unit.damaged) {
        this.loss_factor -= unit.rloss;
      } else {
        this.loss_factor -= unit.loss;
      }
      paths_self.game.state.events.withdrawal_bonus_used = 1;
    }

    if (unit.damaged && !unit.destroyed) {
      console.log('assigning hit to damaged unit...');

      this.moves.push(`damage\t${unit_spacekey}\t${unit_key}\t1\t${paths_self.game.player}`);
      this.loss_factor -= unit.rloss;

      unit.damaged = true;
      unit.destroyed = true;
      unit.damaged_this_combat = true;

      if (el != null) {
        el.style.opacity = '0.3';
        el.onclick = (e) => {};
        el.id = 'destroyed_unit';
      }

      //
      // replace with corps if destroyed
      //
      if (unit.key.indexOf('army') > 0 || unit.key == 'aoi_corps') {
        let corpsbox = 'arbox';
        if (paths_self.returnFactionOfPlayer() == 'central') {
          corpsbox = 'crbox';
        }
        let corpskey = unit.key.split('_')[0] + '_corps';
        if (unit.key == 'mef_army' || unit.key == 'ne_army') { corpskey = 'br_corps'; }
        if (unit.key == 'cau_army') { corpskey = 'ru_corps'; }
        if (unit.key == 'orient_army') { corpskey = 'fr_corps'; }
        if (unit.key == 'yld_army01' || unit.key == 'aoi_corps') { corpskey = 'tu_corps'; }

        let corps_idx = -1;
        let corps_damaged = 0;
        let box = paths_self.game.spaces[corpsbox];
        if (box) {
          for (let z = 0; z < box.units.length; z++) {
            if (box.units[z].key == corpskey && !box.units[z].damaged) {
              corps_idx = z;
              corps_damaged = 0;
              break;
            }
          }
          if (corps_idx == -1) {
            for (let z = 0; z < box.units.length; z++) {
              if (box.units[z].key == corpskey && box.units[z].damaged) {
                corps_idx = z;
                corps_damaged = 1;
                break;
              }
            }
          }
        }

        if (corps_idx >= 0) {
          console.log('space has this unit: ' + corpskey);
          let corpsunit = paths_self.cloneUnit(corpskey);
          corpsunit.attacked = 1; // we don't want to give this the op to attack
          corpsunit.damaged_this_combat = true; // used to be an army...
          corpsunit.spacekey = unit.spacekey;
          if (corps_damaged) { corpsunit.damaged = true; }
          this.units.push(corpsunit);
          if (am_i_the_attacker) {
            paths_self.game.spaces[corpsunit.spacekey].units.push(corpsunit);
            paths_self.game.state.combat.attacker.push({
              key: paths_self.game.state.combat.key,
              unit_idx: paths_self.game.spaces[corpsunit.spacekey].units.length - 1,
              unit_sourcekey: corpsunit.spacekey
            });
          }
          this.moves.push(`add\t${unit.spacekey}\t${corpskey}\t${this.mod.game.player}\tattacked\t${corps_damaged}`);
          this.moves.push(`remove\t${corpsbox}\t${corpskey}\t${this.mod.game.player}\t${corps_damaged}`);
          box.units.splice(corps_idx, 1);
          this.app.browser.addElementToSelector(
            this.unitCardHtml(this.units[this.units.length - 1], this.units.length - 1, true),
            my_qs
          );
          //
          // replace our specified element
          //
          if (el != null) {
            let container = document.querySelector(my_qs);
            el = container.querySelector('.loss-overlay-unit:last-child');
            this.applyUnitTypeClass(el, this.units[this.units.length - 1]);
          } else {
            let container = document.querySelector(my_qs);
            let new_el = container
              ? container.querySelector('.loss-overlay-unit:last-child')
              : null;
            this.applyUnitTypeClass(new_el, this.units[this.units.length - 1]);
          }
        }

        //
        // auto-assignment relies on the unit being properly
        // identified. so we assign the first non-destroyed corps
        // as the unit for taking auto-hits assigment...
        //
        let attacker_units = paths_self.returnAttackerUnits();
        let defender_units = paths_self.returnDefenderUnits();

        if (faction == 'attacker') {
          for (let y = 0; y < attacker_units.length; y++) {
            if (!attacker_units[y].destroyed) {
              this.sole_attacker_unit_id = y;
              this.sole_attacker_unit = attacker_units[y];
            }
          }
        }
        if (faction == 'defender') {
          for (let y = 0; y < defender_units.length; y++) {
            if (!defender_units[y].destroyed) {
              this.sole_defender_unit_id = y;
              this.sole_defender_unit = defender_units[y];
            }
          }
        }

        //
        // now handled below...
        //
        if (el != null) {
          this.attachEvents(am_i_the_attacker, my_qs, faction, just_one_more_hit);
        }
      }

      //
      // move to eliminated box
      //
      let f = this.mod.returnPowerOfUnit(unit);
      this.updateInstructions(
        `${this.mod.returnFactionName(this.mod.returnFactionOfPlayer(this.mod.game.player))} — Assign ${this.loss_factor} More Damage`,
        'action'
      );
    } else {
      console.log('assigning hit to undamaged unit...');

      this.moves.push(`damage\t${unit_spacekey}\t${unit_key}\t0\t${this.mod.game.player}`);
      unit.damaged = true;
      unit.damaged_this_combat = true;
      this.loss_factor -= unit.loss;
      if (el != null) {
        this.applyUnitTypeClass(el, unit);
        el.innerHTML = this.unitTokenInnerHtml(unit, true);
      }
      this.updateInstructions(
        `${this.mod.returnFactionName(this.mod.returnFactionOfPlayer(this.mod.game.player))} — Assign ${this.loss_factor} More Damage`,
        'action'
      );
      console.log('assigning hit to undamaged unit... 2');
    }

    //
    // redisplay space
    //
    this.mod.displaySpace(this.mod.game.state.combat.key);

    console.log('can we take more losses? ' + this.canTakeMoreLosses());

    if (!this.canTakeMoreLosses()) {
      document.querySelectorAll('.loss-overlay-unit').forEach((el) => {
        el.onclick = (e) => {};
      });
      for (let i = this.moves.length - 1; i >= 0; i--) {
        this.mod.addMove(this.moves[i]);
      }
      this.mod.game.status = 'processing...';
      this.mod.hud.updateStatus(this.mod.game.status);
      this.mod.hud.updateMenu([]);
      this.mod.hud.updateCards([]);
      this.mod.endTurn();

      this.mod.displaySpace(this.mod.game.state.combat.key);
      this.mod.displaySpace('aeubox');
      this.mod.displaySpace('arbox');
      this.mod.displaySpace('ceubox');
      this.mod.displaySpace('crbox');
    } else {
      //
      // automatic hits assignment
      //
      if (el == null) {
        this.attachEvents(am_i_the_attacker, my_qs, faction, just_one_more_hit);
      } else {
        // Refresh red-X markers without waiting for the next click
        this.updateAssignableUnits();
      }
    }

    //
    // negative loss factor = we're cancelling hits
    //
    if (this.loss_factor <= 0) {
      this.hide();
    }
  }

  shakeInvalidUnit(el) {
    if (!el) {
      return;
    }
    el.classList.remove('unassignable-shake');
    void el.offsetWidth;
    el.classList.add('unassignable-shake');
    el.addEventListener(
      'animationend',
      () => {
        el.classList.remove('unassignable-shake');
      },
      { once: true }
    );
  }

  attachEvents(am_i_the_attacker, my_qs, faction, just_one_more_hit = false) {
    let paths_self = this.mod;

    console.log('can take more losses: ' + this.canTakeMoreLosses());
    console.log('just one more hit? ' + just_one_more_hit);

    if (!this.canTakeMoreLosses() && just_one_more_hit == false) {
      for (let i = this.moves.length - 1; i >= 0; i--) {
        paths_self.addMove(this.moves[i]);
      }
      paths_self.game.status = 'processing...';
      paths_self.hud.updateStatus(paths_self.game.status);
      paths_self.hud.updateMenu([]);
      paths_self.hud.updateCards([]);
      paths_self.endTurn();
      return;
    }

    console.log('assigning hits? ' + faction);
    console.log('hits assignable def? ' + this.number_of_hits_assignable_defender_units);
    console.log('hits assignable att? ' + this.number_of_hits_assignable_attacker_units);

    if (faction === 'defender' && this.number_of_hits_assignable_defender_units == 1) {
      let idx = this.sole_defender_unit_id;
      let unit = this.sole_defender_unit;
      let unit_key = this.sole_defender_unit.key;
      let unit_spacekey = this.sole_defender_unit.spacekey;
      console.log('assigning hit to: ' + JSON.stringify(unit));
      this.assignHitToUnit(
        unit,
        unit_spacekey,
        unit_key,
        idx,
        null,
        am_i_the_attacker,
        my_qs,
        faction,
        just_one_more_hit
      );
      this.hits_already_assigned = 1;
      this.updateInstructions('All losses have been assigned automatically.', 'resolved');
      return;
    }

    if (faction === 'attacker' && this.number_of_hits_assignable_attacker_units == 1) {
      let idx = this.sole_attacker_unit_id;
      let unit = this.sole_attacker_unit;
      let unit_key = this.sole_attacker_unit.key;
      let unit_spacekey = this.sole_attacker_unit.spacekey;
      console.log('assigning hit to: ' + JSON.stringify(unit));
      this.assignHitToUnit(
        unit,
        unit_spacekey,
        unit_key,
        idx,
        null,
        am_i_the_attacker,
        my_qs,
        faction,
        just_one_more_hit
      );
      this.hits_already_assigned = 1;
      this.updateInstructions('All losses have been assigned automatically.', 'resolved');
      return;
    }

    this.updateAssignableUnits(am_i_the_attacker);

    document.querySelectorAll(my_qs + ' .loss-overlay-unit').forEach((el) => {
      el.onclick = (e) => {
        this.updateAssignableUnits();

        let idx = e.currentTarget.id;
        let unit = this.units[idx];

        if (just_one_more_hit) {
          if (unit.damaged) {
            let others = 0;
            for (let z = 0; z < this.units.length; z++) {
              if (z != idx && this.units[z].destroyed == false) { others++; }
            }
            if (others == 0) {
              this.shakeInvalidUnit(e.currentTarget);
              return;
            }
          }
        } else {
          if (unit.unassignable == 1) {
            this.shakeInvalidUnit(e.currentTarget);
            return;
          }
        }

        let unit_key = e.currentTarget.dataset.key;
        let unit_spacekey = e.currentTarget.dataset.spacekey;

        this.assignHitToUnit(
          unit,
          unit_spacekey,
          unit_key,
          idx,
          el,
          am_i_the_attacker,
          my_qs,
          faction,
          just_one_more_hit
        );
        this.hits_already_assigned = 1;
      };
    });
  }

  updateAssignableUnits() {
    //
    // unset
    //
    for (let z = 0; z < this.units.length; z++) {
      this.units[z].unassignable = 0;
    }

    //
    // first hit must be to one of these units...
    //
    this.priority_hits_required = 0;
    if (this.hits_already_assigned == 0) {
      let priority_found = 0;
      for (let z = 0; z < this.units.length; z++) {
        let u = this.units[z];
        if (u.destroyed) { continue; }
        let priority_step = u.damaged ? u.rloss : u.loss;
        if (this.loss_factor > 0 && priority_step > this.loss_factor) { continue; }
        if (u.priority > 0 && u.priority > priority_found) {
          priority_found = u.priority;
          for (let zz = 0; zz < this.units.length; zz++) {
            this.units[zz].unassignable = 0;
            this.priority_hits_required = 1;
            if (this.units[zz].priority < u.priority) {
              this.units[zz].unassignable = 1;
            }
          }
        }
      }
    }

    if (this.priority_hits_required == 1) {
      for (let z = 0; z < this.units.length; z++) {
        if (this.units[z].destroyed) { continue; }
        let step = this.units[z].damaged ? this.units[z].rloss : this.units[z].loss;
        if (this.loss_factor > 0 && step > this.loss_factor) {
          this.units[z].unassignable = 1;
          this.are_any_units_unassignable = 1;
        }
      }
      this.syncUnassignableUI();
      return;
    }

    //
    // calculate maximum deadzone losses
    //
    // the "deadzone" variable associated with all units refers to the difference
    // between the loss factor they take at this step, and the loss-factor they
    // take as a reduced corps.
    //
    // In situations where we have a damaged army AND an undamaged army in our
    // units and the loss factor of the damaged unit + deadzone < 5, while all
    // undamaged armies have loss factors of 3 (individually) we need to assign
    // the hits to our damaged armies first.
    //
    this.are_any_units_unassignable = 0;
    let damaged_armies = false;
    let undamaged_armies = false;
    let corps_in_play = false;
    let corps_damage = 0;
    let undamaged_min_loss = 100;
    let damaged_max_loss = 0;
    for (let z = 0; z < this.units.length; z++) {
      this.units[z].unassignable = 0;
      if (!this.units[z].destroyed) {
        if (this.units[z].corps) {
          corps_in_play = true;
          if (this.units[z].damaged) {
            corps_damage += 1;
          } else {
            corps_damage += 2;
          }
        } else {
          if (this.units[z].army) {
            if (this.units[z].damaged) {
              damaged_armies = true;
              let max_loss = this.units[z].rloss + 2;
              if (max_loss > damaged_max_loss) {
                damaged_max_loss = max_loss;
              }
            } else {
              undamaged_armies = true;
              let min_loss = this.units[z].loss;
              if (min_loss < undamaged_min_loss) {
                undamaged_min_loss = min_loss;
              }
            }
          }
        }
      }
    }

    console.log('damaged armies: ' + damaged_armies);
    console.log('undamaged_armies: ' + undamaged_armies);
    console.log('corps_in_play: ' + corps_in_play);
    console.log('corps_damage: ' + corps_damage);
    console.log('undamaged_min_loss: ' + undamaged_min_loss);
    console.log('damaged_max_loss: ' + damaged_max_loss);
    console.log('loss_factor: ' + this.loss_factor);

    //
    // loss factor is the same as the undamaged army, but corps exist
    //
    if (
      this.loss_factor == undamaged_min_loss &&
      corps_damage > 0 &&
      corps_damage < this.loss_factor
    ) {
      for (let z = 0; z < this.units.length; z++) {
        if (this.units[z].corps) {
          this.units[z].unassignable = 1;
          this.are_any_units_unassignable = 1;
        }
      }
    }

    //
    // we need to force assign hits when the min loss of the smallest
    // undamaged army is LESS than the loss factor, but MORE than the
    // MIN damaged army + its corps potential, and when there are no
    // corps in play that can soak up the remainder
    //
    if (damaged_armies && undamaged_armies) {
      //
      // if the full army + any corps cannot soak up all damage
      //
      if (undamaged_min_loss + corps_damage < this.loss_factor) {
        //
        // but the undamaged army + corps + future hits can...
        //
        if (damaged_max_loss + corps_damage >= this.loss_factor) {
          for (let z = 0; z < this.units.length; z++) {
            if (!this.units[z].destroyed) {
              if (this.units[z].army && !this.units[z].damaged) {
                this.units[z].unassignable = 1;
                this.are_any_units_unassignable = 1;
              }
            }
          }
        }
      }
    }

    for (let z = 0; z < this.units.length; z++) {
      if (this.units[z].destroyed) { continue; }
      let step = this.units[z].damaged ? this.units[z].rloss : this.units[z].loss;
      if (this.loss_factor > 0 && step > this.loss_factor) {
        this.units[z].unassignable = 1;
        this.are_any_units_unassignable = 1;
      }
    }

    this.syncUnassignableUI();
  }

  syncUnassignableUI() {
    document.querySelectorAll('.loss-overlay-unit').forEach((el) => {
      let unit = this.units[el.id];
      el.classList.toggle('unassignable', !!(unit && unit.unassignable == 1));
    });
  }
}

module.exports = LossOverlay;
