const ImperiumGroundCombatOverlayTemplate = require('./ground-combat.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');

class GroundCombatOverlay {
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
    this.overlay.hide();
    if (this.mod.hud) {
      this.mod.hud.hideCombatRestore('ground');
    }
  }

  minimize() {
    if (!this.visible) {
      return;
    }
    this.minimized = 1;
    this.setOverlayDisplayed(false);
    if (this.mod.hud) {
      this.mod.hud.showCombatRestore('ground', 'show ground combat', () => this.restore());
    }
  }

  restore() {
    if (!this.visible) {
      return;
    }
    this.minimized = 0;
    this.setOverlayDisplayed(true);
    if (this.mod.hud) {
      this.mod.hud.hideCombatRestore('ground');
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

  updateStatusAndAcknowledge(msg = '') {
    if (!this.visible) {
      return;
    }
    try {
      this.setMenuContent(
        `<div class="ground-combat-status">${msg}</div><ul><li class="option" id="acknowledge_it">acknowledge</li></ul>`
      );
      this.attachEvents();
    } catch (err) {
      this.hide();
      this.restartQueue();
    }
  }

  updateStatus(attacker, defender, sector, planet_idx, overlay_html) {
    if (arguments.length === 1) {
      overlay_html = attacker;
    }
    if (this.visible == 0) {
      this.render(attacker, defender, sector, planet_idx, overlay_html);
    } else {
      this.setMenuContent(overlay_html);
    }
  }

  setMenuContent(overlay_html) {
    let menu = document.querySelector('.ground-combat-menu');
    if (menu) {
      menu.innerHTML = overlay_html || '';
    }
  }

  updateOptions(prompt, options, onSelect) {
    let menu = document.querySelector('.ground-combat-menu');
    if (!menu) {
      return;
    }

    menu.innerHTML = '';

    if (prompt) {
      let promptElement = document.createElement('div');
      promptElement.className = 'ground-combat-status';
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

  removeHits() {
    document.querySelectorAll('.ground-combat-overlay .dice-results').forEach((result) => {
      result.style.backgroundColor = '';
      result.classList.remove('is-hit');
      let number = result.querySelector('.unit-box-num');
      if (number) {
        number.textContent = '?';
      }
    });
  }

  render(attacker, defender, sector, planet_idx, overlay_html) {
    this.attacker = attacker;
    this.defender = defender;
    this.sector = sector;

    if (this.visible && document.querySelector('.ground-combat-menu')) {
      this.overlay.show(
        ImperiumGroundCombatOverlayTemplate(
          this.mod,
          attacker,
          defender,
          sector,
          planet_idx,
          overlay_html
        )
      );
      this.attachEvents();
    } else {
      this.visible = 1;
      this.overlay.show(
        ImperiumGroundCombatOverlayTemplate(
          this.mod,
          attacker,
          defender,
          sector,
          planet_idx,
          overlay_html
        )
      );
      this.attachEvents();
    }

    if (this.minimized) {
      this.setOverlayDisplayed(false);
      if (this.mod.hud) {
        this.mod.hud.showCombatRestore('ground', 'show ground combat', () => this.restore());
      }
    }
  }

  updateHits(attacker, defender, sector, planet_idx, combat_info) {
    let nth = 1;
    if (combat_info.attacker == 1) {
      nth = 3;
    }

    if (this.visible == 0) {
      this.render(attacker, defender, sector, planet_idx, '');
    }

    //
    // technically attacker could be attacker or defender here
    //
    attacker = combat_info.attacker;

    let current_infantry_idx = -1;
    let shot_idx = 0;
    for (let i = 0; i < combat_info.infantry_idx.length; i++) {
      if (combat_info.infantry_idx[i] > current_infantry_idx) {
        current_infantry_idx = combat_info.infantry_idx[i];
        shot_idx = 0;
      } else {
        shot_idx++;
      }
      if (combat_info.modified_roll[i] >= combat_info.hits_on[i]) {
        let qs = `.player-${attacker}-ship-${current_infantry_idx}-shot-${shot_idx} .dice-results`;
        let qsn = `.player-${attacker}-ship-${current_infantry_idx}-shot-${shot_idx} .dice-results .unit-box-num`;
        let result = document.querySelector(qs);
        if (result) {
          result.style.backgroundColor = '';
          result.classList.add('is-hit');
        }
        document.querySelector(qsn).innerHTML = combat_info.modified_roll[i];
      } else {
        let qsn = `.player-${attacker}-ship-${current_infantry_idx}-shot-${shot_idx} .dice-results .unit-box-num`;
        document.querySelector(qsn).innerHTML = combat_info.modified_roll[i];
      }
    }
  }

  attachEvents() {
    let root = document.querySelector('.ground-combat-overlay');
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
  }
}

module.exports = GroundCombatOverlay;
