const MainTemplate = require('./main.template');
const Form = require('./form');
const CardUI = require('./card');
const CodeWorkspace = require('./code-workspace');
const ReferenceSidebar = require('./reference-sidebar');
const MyCardsOverlay = require('./overlays/my-cards');
const EmptyCodeConfirm = require('./overlays/empty-code-confirm');
const Card = require('../card');

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.view = 'home';
    this.workspace = 'image';
    this.card_ui = new CardUI(app, mod, '.tscardgen-sidebar');
    this.form = new Form(app, mod, this);
    this.code_workspace = new CodeWorkspace(app, mod, this);
    this.reference_sidebar = new ReferenceSidebar(app, mod);
    this.my_cards = new MyCardsOverlay(app, mod);
    this.empty_code_confirm = new EmptyCodeConfirm(app, mod);
  }

  render(view = this.view) {
    const container = document.querySelector('#saito-container');
    if (!container) {
      return;
    }

    this.view = view === 'generator' ? 'generator' : 'home';
    container.classList.add('tscardgen-page');
    this.app.browser.replaceElementContentBySelector(
      MainTemplate(this.view, this.workspace),
      '#saito-container'
    );

    if (this.view === 'generator') {
      this.attachWorkspaceNav();
      this.renderWorkspace();
      return;
    }

    this.attachHomeEvents();
  }

  showHome() {
    this.render('home');
  }

  showGenerator() {
    this.workspace = 'image';
    this.render('generator');
  }

  setWorkspace(workspace) {
    const next = workspace === 'code' ? 'code' : 'image';
    if (next === this.workspace && this.view === 'generator') {
      return;
    }

    this.flushActiveWorkspace();
    this.workspace = next;
    this.render('generator');
  }

  flushActiveWorkspace() {
    if (this.workspace === 'code') {
      this.code_workspace.syncToCard();
      this.code_workspace.teardownEditor();
      return;
    }
    this.form.syncFromForm();
  }

  renderWorkspace() {
    if (this.workspace === 'code') {
      this.code_workspace.render();
      this.reference_sidebar.render();
      return;
    }

    this.form.render();
    this.card_ui.render();
  }

  attachWorkspaceNav() {
    document.querySelectorAll('.tscardgen-workspace-btn').forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        this.setWorkspace(button.getAttribute('data-workspace'));
      };
    });
  }

  attachHomeEvents() {
    const createBtn = document.getElementById('tscardgen-create-btn');
    if (createBtn) {
      createBtn.onclick = (e) => {
        e.preventDefault();
        this.showGenerator();
      };
    }

    const myCardsBtn = document.getElementById('tscardgen-my-cards-btn');
    if (myCardsBtn) {
      myCardsBtn.onclick = (e) => {
        e.preventDefault();
        this.my_cards.render();
      };
    }
  }

  async paintCaptureCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = Card.WIDTH;
    canvas.height = Card.HEIGHT;
    await this.mod.card.paint(canvas);
    return canvas;
  }

  async downloadPng() {
    this.flushActiveWorkspace();
    const canvas = await this.paintCaptureCanvas();
    const link = document.createElement('a');
    link.href = this.mod.card.toDataURL(canvas);
    link.download = this.mod.card.downloadName();
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async requestCreateNft() {
    this.flushActiveWorkspace();

    if (!this.mod.card.hasExecutableCode()) {
      this.empty_code_confirm.on_add_code = () => this.setWorkspace('code');
      this.empty_code_confirm.on_create_without_code = () => {
        this.mod.openCreateNft();
      };
      this.empty_code_confirm.render();
      return;
    }

    await this.mod.openCreateNft();
  }
}

module.exports = Main;
