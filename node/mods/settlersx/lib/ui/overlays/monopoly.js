const MonopolyOverlayTemplate = require('./monopoly.template');
const SaitoOverlay = require('./../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class MonopolyOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
    this.player = null;
    this.cardname = null;
  }

  render(card) {
    this.overlay.show(MonopolyOverlayTemplate(this.app, this.mod, this), () => {
      //Allow to cancel by clicking out of overlay
      this.mod.game.state.players[this.mod.game.player - 1].devcards.push(card);
      this.mod.game.state.canPlayCard = true;
      this.mod.updateControls();
      document.getElementById('playcard')?.classList.toggle('enabled', !!this.mod.canPlayerPlayCard());
      this.mod.sxRefresh?.();
    });
    this.attachEvents();
  }

  attachEvents() {
    const this_self = this;
    document
      .querySelectorAll('.settlers-selection-overlay .settlers-desired-resources img')
      .forEach((card) => {
        card.onclick = (e) => {
          let target = e.currentTarget;
          let card = target.getAttribute('id');

          this_self.mod.addMove(`monopoly\t${this_self.player}\t${this_self.cardname}\t${card}`);
          this_self.mod.endTurn();
          this_self.overlay.remove();
          return 0;
        };
      });
  }
}

module.exports = MonopolyOverlay;
