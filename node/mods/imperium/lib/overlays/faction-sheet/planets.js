const Template = require('./planets.template');

class FactionSheetPlanets {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
  }

  render(player) {
    let el = document.querySelector('.faction-sheet-body');
    if (!el) {
      return;
    }
    let payment = this.mod.faction_sheet_overlay && this.mod.faction_sheet_overlay.production_payment;
    el.innerHTML = Template(this.mod, player, payment || null);
    if (payment) {
      this.bindPayment(el, payment);
    }
  }

  bindPayment(el, payment) {
    el.querySelectorAll('.fs-planet.is-payable').forEach((card) => {
      card.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        payment.commit('planet', card.getAttribute('data-planet'));
      };
    });
    let goods = el.querySelector('.fs-pay-goods');
    if (goods) {
      goods.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        payment.commit('goods');
      };
    }
  }
}

module.exports = FactionSheetPlanets;
