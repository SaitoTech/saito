const SaitoOverlay = require('../../../../lib/saito/ui/saito-overlay/saito-overlay');
const Card = require('./card');
const Main = require('./ui/main');

const MOUNT = '#twilight-cardgen-mount';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * Host object passed to the card studio UI. The game module stays Twilight.
 */
class CardgenHost {
  constructor(app, game_mod) {
    this.app = app;
    this.game_mod = game_mod;
    this.card = new Card(app, this);
  }

  startCustomCardTest() {
    this.game_mod.startCustomCardTest(this.card);
  }

  async openCreateNft() {
    const studio = this.app.modules?.returnModule?.('TSCardGen');
    if (!studio || typeof studio.openCreateNft !== 'function') {
      salert('Card minting is unavailable in this game session');
      return;
    }
    studio.card = this.card;
    studio.main = this.game_mod.cardgen_studio?.main || studio.main;
    return studio.openCreateNft();
  }
}

class CardStudio {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.host = new CardgenHost(app, mod);
    this.main = new Main(app, this.host);
    this.main.mount = MOUNT;
    this.overlay = new SaitoOverlay(app, mod, true, false, false);
    this.overlay.clickBackdropToClose = false;
    this.overlay.class = 'saito-overlay twilight-cardgen-overlay';
    this._draft_ready = false;
    this._assets_ready = null;
  }

  ensureAssets() {
    if (this._assets_ready) {
      return this._assets_ready;
    }
    this._assets_ready = (async () => {
      if (this.app?.browser?.addStylesheet) {
        this.app.browser.addStylesheet('/tscardgen/style.css');
        this.app.browser.addStylesheet('/saito/lib/nftstudio/codemirror.min.css');
      }
      await loadScript('/saito/lib/nftstudio/codemirror.min.js');
      await loadScript('/saito/lib/nftstudio/javascript.min.js');
    })().catch((err) => {
      this._assets_ready = null;
      console.warn('Card studio assets failed to load', err);
    });
    return this._assets_ready;
  }

  restoreDraft() {
    if (this._draft_ready) {
      return;
    }
    this.main.restoreLocalDraft();
    this._draft_ready = true;
  }

  pushHudUnder() {
    const hud = document.getElementById('game-hud2');
    const overlay_el = document.getElementById(`saito-overlay${this.overlay.ordinal}`);
    if (!hud || !overlay_el) {
      return;
    }
    const z = parseInt(overlay_el.style.zIndex, 10);
    if (Number.isFinite(z)) {
      hud.style.zIndex = String(z - 2);
    }
  }

  restoreHud() {
    const hud = document.getElementById('game-hud2');
    if (hud) {
      hud.style.zIndex = '';
    }
  }

  async render(workspace = 'image') {
    await this.ensureAssets();
    this.restoreDraft();
    this.main.workspace = workspace === 'code' ? 'code' : 'image';
    this.overlay.show(`<div id="twilight-cardgen-mount"></div>`, () => this.restoreHud());
    this.main.render('generator');
    this.pushHudUnder();
  }

  hideForTest() {
    this.main.flushActiveWorkspace();
    this.overlay.hide();
    this.restoreHud();
  }

  async showCode() {
    await this.ensureAssets();
    this.restoreDraft();
    this.main.workspace = 'code';
    const mount = document.getElementById('twilight-cardgen-mount');
    const html = mount ? '' : '<div id="twilight-cardgen-mount"></div>';
    this.overlay.show(html, () => this.restoreHud());
    this.main.render('generator');
    this.pushHudUnder();
  }
}

module.exports = CardStudio;
