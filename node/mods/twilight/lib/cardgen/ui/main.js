const MainTemplate = require('./main.template');
const Form = require('./form');
const CardUI = require('./card');
const CodeWorkspace = require('./code-workspace');
const ReferenceSidebar = require('./reference-sidebar');
const MyCardsOverlay = require('./overlays/my-cards');
const EmptyCodeConfirm = require('./overlays/empty-code-confirm');
const Card = require('../card');
const { loadDraft, saveDraft, clearDraft } = require('../draft-store');

const SAVE_DEBOUNCE_MS = 750;
const SAVE_INDICATOR_HOLD_MS = 1600;
const SAVE_INDICATOR_MIN_MS = 400;

class Main {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.view = 'home';
    this.workspace = 'image';
    this.card_ui = new CardUI(app, mod, '.tscardgen-sidebar');
    this.form = new Form(app, mod, this);
    this.code_workspace = new CodeWorkspace(app, mod, this);
    this.reference_sidebar = new ReferenceSidebar(app, mod, this);
    this.my_cards = new MyCardsOverlay(app, mod);
    this.empty_code_confirm = new EmptyCodeConfirm(app, mod);

    this.mount = '#saito-container';
    this.autosave_enabled = false;
    this.save_timer = null;
    this.save_status = 'idle';
    this.save_status_text = '';
    this.save_hide_timer = null;
    this.save_started_at = 0;
    this.last_saved_json = null;
  }

  render(view = this.view) {
    const mount = this.mount || '#saito-container';
    const container = document.querySelector(mount);
    if (!container) {
      return;
    }

    this.view = view === 'generator' ? 'generator' : 'home';
    if (mount === '#saito-container') {
      container.classList.add('tscardgen-page');
    }
    this.app.browser.replaceElementContentBySelector(
      MainTemplate(this.view, this.workspace),
      mount
    );

    if (this.view === 'generator') {
      this.attachWorkspaceNav();
      this.attachNewCardControl();
      this.renderSaveStatus();
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

  attachNewCardControl() {
    document.querySelector('[data-action="new-card"]')?.addEventListener('click', (event) => {
      event.preventDefault();
      this.startNewCard();
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

  /**
   * Restore a locally cached card before the editor becomes interactive.
   * Must run before autosave is enabled so defaults cannot overwrite a draft.
   */
  restoreLocalDraft() {
    this.autosave_enabled = false;
    const draft = loadDraft(this.storage());
    if (!draft?.card) {
      this.last_saved_json = null;
      this.autosave_enabled = true;
      return false;
    }

    this.mod.card.reset(draft.card);
    this.last_saved_json = JSON.stringify(draft.card);
    this.loadCardImage(this.mod.card.image_url);
    this.autosave_enabled = true;
    return true;
  }

  startNewCard() {
    this.cancelPendingSave();
    clearDraft(this.storage());
    this.last_saved_json = null;
    this.mod.card.reset();
    this.mod.card.image = null;
    this.mod.card.image_url = '';
    this.workspace = 'image';
    this.setSaveStatus('idle', '');
    this.autosave_enabled = true;
    this.render('generator');
  }

  storage() {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch (_) {
      return null;
    }
  }

  loadCardImage(image_url) {
    const url = String(image_url || '');
    if (!url) {
      this.mod.card.image = null;
      this.mod.card.image_url = '';
      return;
    }

    this.mod.card.image_url = url;
    if (typeof Image === 'undefined') {
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (this.mod.card.image_url !== url) {
        return;
      }
      this.mod.card.image = image;
      if (this.view === 'generator' && this.workspace === 'image') {
        this.card_ui.draw();
      }
    };
    image.onerror = () => {
      console.warn('TSCardGen: failed to restore cached card image');
    };
    image.src = url;
  }

  scheduleCardSave({ immediate = false } = {}) {
    if (!this.autosave_enabled) {
      return;
    }

    if (this.save_timer) {
      clearTimeout(this.save_timer);
      this.save_timer = null;
    }

    if (immediate) {
      this.saveCardDraft();
      return;
    }

    this.save_timer = setTimeout(() => {
      this.save_timer = null;
      this.saveCardDraft();
    }, SAVE_DEBOUNCE_MS);
  }

  cancelPendingSave() {
    if (this.save_timer) {
      clearTimeout(this.save_timer);
      this.save_timer = null;
    }
    if (this.save_hide_timer) {
      clearTimeout(this.save_hide_timer);
      this.save_hide_timer = null;
    }
  }

  /**
   * Central local autosave. Flushes the active editor into the card first.
   */
  saveCardDraft() {
    if (!this.autosave_enabled) {
      return false;
    }

    if (this.view === 'generator') {
      if (this.workspace === 'code') {
        this.code_workspace.syncToCard();
      } else {
        this.form.syncFromForm({ skip_autosave: true });
      }
    }

    const card_data = this.mod.card.toDraftData();
    // Compare card payload only; savedAt always changes.
    const card_json = JSON.stringify(card_data);
    if (this.last_saved_json && this.last_saved_json === card_json) {
      return true;
    }

    this.save_started_at = Date.now();
    this.setSaveStatus('saving', 'Saving...');

    try {
      const { draft } = saveDraft(this.storage(), card_data);
      this.last_saved_json = JSON.stringify(draft.card);
      const elapsed = Date.now() - this.save_started_at;
      const wait = Math.max(0, SAVE_INDICATOR_MIN_MS - elapsed);
      if (this.save_hide_timer) {
        clearTimeout(this.save_hide_timer);
      }
      this.save_hide_timer = setTimeout(() => {
        this.setSaveStatus('saved', 'Saved');
        this.save_hide_timer = setTimeout(() => {
          this.setSaveStatus('idle', '');
          this.save_hide_timer = null;
        }, SAVE_INDICATOR_HOLD_MS);
      }, wait);
      return true;
    } catch (err) {
      console.error('TSCardGen: local draft save failed', err);
      this.setSaveStatus('error', 'Save failed');
      if (this.save_hide_timer) {
        clearTimeout(this.save_hide_timer);
      }
      this.save_hide_timer = setTimeout(() => {
        this.setSaveStatus('idle', '');
        this.save_hide_timer = null;
      }, SAVE_INDICATOR_HOLD_MS * 1.5);
      return false;
    }
  }

  setSaveStatus(status, text) {
    this.save_status = status;
    this.save_status_text = text || '';
    this.renderSaveStatus();
  }

  renderSaveStatus() {
    const el = document.querySelector('[data-role="save-status"]');
    if (!el) {
      return;
    }

    el.textContent = this.save_status_text;
    el.classList.toggle('is-visible', Boolean(this.save_status_text));
    el.classList.toggle('is-saving', this.save_status === 'saving');
    el.classList.toggle('is-saved', this.save_status === 'saved');
    el.classList.toggle('is-error', this.save_status === 'error');
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
