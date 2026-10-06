const ImperiumSpaceCombatOverlayTemplate = require('./space-combat.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class SpaceCombatOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.attacker = null;
    this.defender = null;
    this.sector = null;
    this.visible = 0;
    this.minimized = 0;
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
    this.overlay.clickBackdropToClose = false;
  }

  hide() {
    this.visible = 0;
    this.minimized = 0;
    this.hitAssignment = null;
    this.overlay.hide();
    if (this.mod.hud) {
      this.mod.hud.hideCombatRestore('space');
    }
  }

  minimize() {
    if (!this.visible) {
      return;
    }
    this.minimized = 1;
    this.setOverlayDisplayed(false);
    if (this.mod.hud) {
      this.mod.hud.showCombatRestore('space', 'show space combat', () => this.restore());
    }
  }

  restore() {
    if (!this.visible) {
      return;
    }
    this.minimized = 0;
    this.setOverlayDisplayed(true);
    if (this.mod.hud) {
      this.mod.hud.hideCombatRestore('space');
    }
  }

  setOverlayDisplayed(shown) {
    let el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    let backdrop = document.getElementById(`saito-overlay-backdrop${this.overlay.ordinal}`);
    if (el) {
      el.style.display = shown ? 'block' : 'none';
    }
    if (backdrop) {
      backdrop.style.display = shown ? 'block' : 'none';
    }
  }

  removeHits() {
    document.querySelectorAll('.space-combat-overlay .dice-results').forEach((result) => {
      result.style.backgroundColor = '';
      result.classList.remove('is-hit');
      let number = result.querySelector('.unit-box-num');
      if (number) {
        number.textContent = '?';
      }
    });
  }

  updateStatusAndAcknowledge(msg = '') {
    if (!this.visible) {
      return;
    }
    try {
      this.updateStatus(`<div class="space-combat-status">${msg}</div><ul><li class="option" id="acknowledge_it">acknowledge</li></ul>`);
      this.attachEvents();
    } catch (err) {
      this.hide();
      this.restartQueue();
    }
  }

  updateStatus(overlay_html) {
    try {
      document.querySelector('.space-combat-menu').innerHTML = overlay_html;
    } catch (err) {}
  }

  updateOptions(prompt, options, onSelect) {
    let menu = document.querySelector('.space-combat-menu');
    if (!menu) {
      return;
    }

    menu.innerHTML = '';

    if (prompt) {
      let promptElement = document.createElement('div');
      promptElement.className = 'space-combat-status';
      promptElement.textContent = prompt;
      menu.appendChild(promptElement);
    }

    if (!Array.isArray(options) || options.length === 0) {
      return;
    }

    let list = document.createElement('ul');
    for (let i = 0; i < options.length; i++) {
      let option = options[i];
      let item = document.createElement('li');
      item.className = `option${option.class ? ` ${option.class}` : ''}`;
      item.id = String(option.id);
      item.innerHTML = option.label;
      item.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onSelect === 'function') {
          onSelect(item.id);
        }
      };
      list.appendChild(item);
    }
    menu.appendChild(list);
  }

  render(attacker, defender, sector, overlay_html, stage = 'space_combat', combat_info = null) {
    if (this.mod.game_help) {
      this.mod.game_help.hide();
    }

    let combatAttacker = parseInt(this.mod.game.state.space_combat_attacker, 10);
    let combatDefender = parseInt(this.mod.game.state.space_combat_defender, 10);
    if (stage !== 'anti_fighter_barrage' && combatAttacker > 0 && combatDefender > 0) {
      attacker = combatAttacker;
      defender = combatDefender;
    }
    this.attacker = attacker;
    this.defender = defender;
    this.sector = sector;

    if (this.visible && document.querySelector('.space-combat-overlay')) {
      let current = document.querySelector('.space-combat-overlay');
      let replacement = document.createElement('div');
      replacement.innerHTML = ImperiumSpaceCombatOverlayTemplate(
        this.mod,
        attacker,
        defender,
        sector,
        overlay_html,
        stage,
        combat_info
      );
      let next = replacement.firstElementChild;
      next.classList.add('saito-overlay-panel');
      current.replaceWith(next);
      this.hitAssignment = null;
      this.attachEvents();
    } else {
      this.visible = 1;
      this.overlay.show(
        ImperiumSpaceCombatOverlayTemplate(this.mod, attacker, defender, sector, overlay_html, stage, combat_info)
      );
      this.attachEvents();
    }

    if (this.minimized) {
      this.setOverlayDisplayed(false);
      if (this.mod.hud) {
        this.mod.hud.showCombatRestore('space', 'show space combat', () => this.restore());
      }
    }
  }

  beginHitAssignment(totalHits, targetTypes, targetCount, onAssign) {
    let root = document.querySelector('.space-combat-overlay');
    if (!root) {
      return;
    }

    this.hitAssignment = {
      remaining: totalHits,
      targetTypes,
      targetCount,
      onAssign
    };

    root.classList.add('is-assigning-hits');
    root.querySelectorAll('.battle-unit').forEach((row) => {
      let player = parseInt(row.dataset.player, 10);
      let shipIndex = parseInt(row.dataset.shipIndex, 10);
      let ships = this.mod.returnSectorAndPlanets(this.sector).s.units[player - 1];
      let unit = ships && ships[shipIndex];
      let combatValue = row.querySelector('.battle-unit-combat strong');
      let combatLabel = row.querySelector('.battle-unit-combat span');
      if (combatValue && unit) {
        combatValue.textContent = unit.strength;
      }
      if (combatLabel) {
        combatLabel.textContent = 'strength';
      }
      if (player === this.mod.game.player && unit && unit.destroyed != 1 && unit.strength > 0) {
        row.classList.add('can-assign-hit');
        row.setAttribute('role', 'button');
        row.setAttribute('tabindex', '0');
        row.setAttribute('aria-label', `Assign a hit to ${row.querySelector('.battle-unit-name').textContent}`);
      }
    });
    this.updateStatus(
      `<div class="space-combat-hit-assignment"><strong>Assign <span class="hits-remaining">${totalHits}</span> hit${totalHits === 1 ? '' : 's'}</strong><span>Click one of your highlighted ships. Damaged ships can take another hit.</span></div>`
    );
    this.attachEvents();
  }

  updateAssignmentStatus() {
    let remaining = document.querySelector('.space-combat-menu .hits-remaining');
    if (remaining && this.hitAssignment) {
      remaining.textContent = this.hitAssignment.remaining;
      let title = remaining.closest('strong');
      if (title) {
        title.lastChild.textContent = this.hitAssignment.remaining === 1 ? ' hit' : ' hits';
      }
    }
  }

  updateHits(attacker, defender, sector, combat_info, stage = 'space_combat') {
    if (this.visible == 0 || stage === 'anti_fighter_barrage') {
      this.render(attacker, defender, sector, '', stage, combat_info);
    }

    //
    // technically attacker could be attacker or defender here
    //
    attacker = combat_info.attacker;

    let current_ship_idx = -2;
    let shot_idx = 0;
    for (let i = 0; i < combat_info.ship_idx.length; i++) {
      if (combat_info.ship_idx[i] > current_ship_idx) {
        current_ship_idx = combat_info.ship_idx[i];
        shot_idx = 0;
      } else {
        shot_idx++;
      }

      if (combat_info.modified_roll[i] >= combat_info.hits_on[i]) {
        let result = document.querySelector(
          `.player-${attacker}-ship-${current_ship_idx}-shot-${shot_idx} .dice-results`
        );
        let number = result && result.querySelector('.unit-box-num');
        if (result) {
          result.style.backgroundColor = '';
          result.classList.add('is-hit');
        }
        if (number) {
          number.textContent = combat_info.modified_roll[i];
        }
      } else {
        let number = document.querySelector(
          `.player-${attacker}-ship-${current_ship_idx}-shot-${shot_idx} .dice-results .unit-box-num`
        );
        if (number) {
          number.textContent = combat_info.modified_roll[i];
        }
      }
    }
  }

  attachEvents() {
    let root = document.querySelector('.space-combat-overlay');
    if (!root) {
      return;
    }

    let closeButton = root.querySelector('.saito-overlay-closebox');
    if (closeButton) {
      closeButton.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.minimize();
      };
    }

    let acknowledgeButton = root.querySelector('#acknowledge_it');
    if (acknowledgeButton) {
      acknowledgeButton.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (acknowledgeButton.dataset.acknowledged === '1') {
          return;
        }
        acknowledgeButton.dataset.acknowledged = '1';
        acknowledgeButton.classList.add('is-acknowledged');
        acknowledgeButton.setAttribute('aria-disabled', 'true');
        acknowledgeButton.textContent = 'Acknowledged — waiting…';

        let interaction = this.mod.hud && this.mod.hud.interactionRegion();
        let acknowledge = interaction && interaction.querySelector('.imperium-hud-acknowledge-button');
        if (!acknowledge && interaction) {
          acknowledge = interaction.querySelector('.acknowledge');
        }
        if (!acknowledge) {
          acknowledge = document.querySelector('.saito-overlay .controls .acknowledge');
        }
        if (acknowledge) {
          acknowledge.click();
        }
      };
    }

    root.onclick = (e) => {
      if (e.target.closest('.space-combat-menu')) {
        return;
      }
      let row = e.target.closest('.battle-unit.can-assign-hit');
      if (!row || !this.hitAssignment) {
        return;
      }

      let unitIndex = parseInt(row.dataset.shipIndex, 10);
      let player = this.mod.game.player;
      let sys = this.mod.returnSectorAndPlanets(this.sector);
      let unit = sys.s.units[player - 1][unitIndex];
      if (parseInt(row.dataset.player, 10) !== player || !unit || unit.destroyed == 1 || unit.strength <= 0) {
        row.classList.remove('can-assign-hit');
        row.removeAttribute('role');
        row.removeAttribute('tabindex');
        row.setAttribute('aria-disabled', 'true');
        return;
      }

      if (this.hitAssignment.targetCount > 0 && !this.hitAssignment.targetTypes.includes(unit.type)) {
        this.updateStatus(
          `<div class="space-combat-hit-assignment"><strong>Assign <span class="hits-remaining">${this.hitAssignment.remaining}</span> hit${this.hitAssignment.remaining === 1 ? '' : 's'}</strong><span>Assign hits to the required unit types first.</span></div>`
        );
        this.updateAssignmentStatus();
        return;
      }

      let assignment = this.hitAssignment;
      assignment.remaining--;
      if (assignment.targetCount > 0 && assignment.targetTypes.includes(unit.type)) {
        assignment.targetCount--;
      }
      let keepAssigning = assignment.onAssign(unitIndex, unit);
      if (this.hitAssignment !== assignment) {
        return;
      }

      let damaged = unit.strength < unit.max_strength;
      let combatValue = row.querySelector('.battle-unit-combat strong');
      let combatLabel = row.querySelector('.battle-unit-combat span');
      if (combatValue) {
        combatValue.textContent = Math.max(0, unit.strength);
      }
      if (combatLabel) {
        combatLabel.textContent = 'strength';
      }
      row.classList.add('hit-assigned');
      let name = row.querySelector('.battle-unit-name');
      if (unit.strength <= 0 || unit.destroyed == 1) {
        row.classList.add('is-destroyed');
        row.classList.remove('is-damaged');
        row.classList.remove('can-assign-hit');
        row.removeAttribute('role');
        row.removeAttribute('tabindex');
        row.setAttribute('aria-disabled', 'true');
        if (name) {
          name.textContent = `${unit.name} (destroyed)`;
        }
      } else {
        row.classList.toggle('is-damaged', damaged);
        if (name) {
          name.textContent = `${unit.name}${damaged ? ' (damaged)' : ''}`;
          row.setAttribute('aria-label', `Assign a hit to ${name.textContent}`);
        }
      }

      if (keepAssigning === false || this.hitAssignment.remaining <= 0) {
        this.hitAssignment = null;
        root.classList.remove('is-assigning-hits');
        root.querySelectorAll('.battle-unit').forEach((fleetRow) => {
          fleetRow.classList.remove('can-assign-hit');
          fleetRow.removeAttribute('role');
          fleetRow.removeAttribute('tabindex');
          fleetRow.removeAttribute('aria-label');
        });
        this.updateStatus('<div>Hits assigned. Waiting for combat to continue…</div>');
        return;
      }

      this.updateAssignmentStatus();
    };

    root.onkeydown = (e) => {
      let row = e.target.closest('.battle-unit.can-assign-hit');
      if (row && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        row.click();
      }
    };
  }
}

module.exports = SpaceCombatOverlay;
