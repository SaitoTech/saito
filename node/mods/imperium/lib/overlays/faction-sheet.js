const ImperiumFactionSheetOverlayTemplate = require('./faction-sheet.template');
const SaitoOverlay = require('./../../../../lib/saito/ui/saito-overlay/saito-overlay');
const TokenBar = require('./../tokenbar');
const FactionSheetOverview = require('./faction-sheet/overview');
const FactionSheetPlanets = require('./faction-sheet/planets');
const FactionSheetActionCards = require('./faction-sheet/action-cards');
const FactionSheetObjectives = require('./faction-sheet/objectives');
const FactionSheetTechnologies = require('./faction-sheet/technologies');
const FactionSheetPromissory = require('./faction-sheet/promissory');

class FactionSheetOverlay {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.tokenbar = new TokenBar(this.app, this.mod, '.faction-sheet-tokenbar');
    this.overlay = new SaitoOverlay(this.app, this.mod, false);
    this.player = 1;
    this.active_tab = 'overview';
    this.production_payment = null;
    this.technology_research = null;
    this.tabs = [
      { id: 'overview', label: 'Overview' },
      { id: 'planets', label: 'Planets' },
      { id: 'action-cards', label: 'Action Cards' },
      { id: 'objectives', label: 'Objectives' },
      { id: 'technologies', label: 'Technologies' },
      { id: 'promissory', label: 'Promissory' }
    ];
    this.panels = {
      overview: new FactionSheetOverview(this.app, this.mod),
      planets: new FactionSheetPlanets(this.app, this.mod),
      'action-cards': new FactionSheetActionCards(this.app, this.mod),
      objectives: new FactionSheetObjectives(this.app, this.mod),
      technologies: new FactionSheetTechnologies(this.app, this.mod),
      promissory: new FactionSheetPromissory(this.app, this.mod)
    };
  }

  beginProductionPayment(player, payment) {
    this.production_payment = payment;
    this.render(player, 'planets');
  }

  updateProductionPayment(payment) {
    this.production_payment = payment;
    if (this.active_tab == 'planets') {
      this.panels.planets.render(this.player);
    }
  }

  finishProductionPayment() {
    this.production_payment = null;
    this.overlay.remove();
  }

  beginTechnologyResearch(player, choose) {
    this.technology_research = choose;
    this.render(player, 'technologies');
  }

  finishTechnologyResearch() {
    this.technology_research = null;
    this.overlay.remove();
  }

  render(player, tab) {
    this.player = player;
    if (!tab) {
      if (this.production_payment) {
        tab = 'planets';
      } else if (this.technology_research) {
        tab = 'technologies';
      } else {
        tab = 'overview';
      }
    }
    this.active_tab = tab;

    let faction_name = this.mod.returnFactionNickname(player);
    this.overlay.show(
      ImperiumFactionSheetOverlayTemplate(this.mod, player, faction_name, this.tabs, this.active_tab)
    );

    this.tokenbar.render(player);
    this.showTab(this.active_tab);
    this.attachEvents();
  }

  showTab(tab_id) {
    if (!this.panels[tab_id]) {
      tab_id = 'overview';
    }
    this.active_tab = tab_id;

    document.querySelectorAll('.faction-sheet-tab').forEach((el) => {
      el.classList.toggle('active', el.dataset.tab === tab_id);
    });

    let body = document.querySelector('.faction-sheet-body');
    if (body) {
      body.innerHTML = '';
    }

    this.panels[tab_id].render(this.player);
  }

  attachEvents() {
    document.querySelectorAll('.faction-sheet-tab').forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showTab(el.dataset.tab);
      };
    });
  }
}

module.exports = FactionSheetOverlay;
