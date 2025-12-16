const CombatTemplate = require('./combat.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class CombatOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);

    this.attackers = []; // array of attacker objects { key, img }
    this.defenders = {}; // map attackerKey -> [defenderKeys]
  }

  render(obj = {}) {
    if (obj.attackers) this.attackers = obj.attackers;
    this.overlay.show(CombatTemplate());

    this.renderAttackers();
    this.renderBlockers();
    this.attachEvents();
  }

  renderAttackers() {
    let container = document.querySelector('.attackers-row');
    container.innerHTML = '';

    this.attackers.forEach(attacker => {
      const attackerDiv = document.createElement('div');
      attackerDiv.classList.add('attacker-slot');
      attackerDiv.setAttribute('data-attacker', attacker.key);
      attackerDiv.innerHTML = `
        <div class="attacker-card">
          <img src="/realms/img/cards/${attacker.img}" class="card large">
        </div>
        <div class="arrow-down">⬇</div>
      `;
      container.appendChild(attackerDiv);
    });
  }

  renderBlockers() {
    let container = document.querySelector('.blockers-row');
    container.innerHTML = '';

    this.attackers.forEach(attacker => {
      const defenderSlot = document.createElement('div');
      defenderSlot.classList.add('defender-slot');
      defenderSlot.setAttribute('data-attacker', attacker.key);
      defenderSlot.innerHTML = `
        <div class="defender-dropzone" data-attacker="${attacker.key}">
          ${
            this.defenders[attacker.key]?.length
              ? this.defenders[attacker.key]
                  .map((defKey, idx) => `
                    <div class="defender-card" draggable="true" data-order="${idx}" data-card="${defKey}">
                      <img src="/realms/img/cards/${this.mod.deck[defKey].img}" class="card small">
                    </div>
                  `).join('')
              : `<div class="empty-slot-text">click to add defender</div>`
          }
        </div>
      `;
      container.appendChild(defenderSlot);
    });

    this.enableDragAndDrop();
  }

  attachEvents() {
    // Click to select defenders
    document.querySelectorAll('.defender-dropzone').forEach(zone => {
      zone.onclick = (e) => {
        let attackerKey = zone.getAttribute('data-attacker');
        this.mod.hud.showSelectableDefenders((selectedDefKey) => {
          if (!this.defenders[attackerKey]) this.defenders[attackerKey] = [];
          this.defenders[attackerKey].push(selectedDefKey);
          this.renderBlockers();
        });
      };
    });

    // Submit button
    document.getElementById('submit-defense').onclick = (e) => {
      let defenseData = this.defenders;
      this.mod.addMove(`combat_defense\t${this.mod.game.player}\t${JSON.stringify(defenseData)}`);
      this.mod.endTurn();
      this.overlay.hide();
    };
  }

  enableDragAndDrop() {
    const draggables = document.querySelectorAll('.defender-card');
    const zones = document.querySelectorAll('.defender-dropzone');

    draggables.forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('card', e.target.dataset.card);
        e.dataTransfer.setData('attacker', e.target.closest('.defender-dropzone').dataset.attacker);
      });
    });

    zones.forEach(zone => {
      zone.addEventListener('dragover', (e) => e.preventDefault());

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        const card = e.dataTransfer.getData('card');
        const fromAttacker = e.dataTransfer.getData('attacker');
        const toAttacker = zone.dataset.attacker;

        // Move defender between slots or reorder
        if (fromAttacker !== toAttacker) {
          this.defenders[fromAttacker] = this.defenders[fromAttacker].filter(c => c !== card);
          if (!this.defenders[toAttacker]) this.defenders[toAttacker] = [];
          this.defenders[toAttacker].push(card);
        } else {
          // reorder within same attacker
          const arr = this.defenders[toAttacker];
          arr.splice(arr.indexOf(card), 1);
          arr.push(card);
        }
        this.renderBlockers();
      });
    });
  }
}

module.exports = CombatOverlay;

