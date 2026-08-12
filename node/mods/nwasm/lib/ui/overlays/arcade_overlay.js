const ArcadeOverlayTemplate = require('./arcade_overlay.template');
const NewGameOverlay = require('./new-game');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

/**
 * NWASM library panel opened from the Arcade Nintendo 64 Game card.
 * Owned entirely by NWASM — Arcade only invokes Game.onClick().
 */
class NwasmArcadeOverlay {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, true);
    this.new_game_overlay = new NewGameOverlay(app, mod);
    this.games = [];
    this.is_open = false;
    this.upload_busy = false;
  }

  async open() {
    await this.render();
  }

  async refresh() {
    if (!this.is_open) {
      return;
    }
    await this.render();
  }

  async render() {
    if (!this.mod?.ui?.load_games) {
      return;
    }

    this.games = await this.mod.ui.load_games();
    this.mod.ui.games = this.games;

    this.overlay.show(ArcadeOverlayTemplate(this.app, this.mod, this.games), () => {
      this.is_open = false;
      this.upload_busy = false;
    });
    this.is_open = true;
    this.upload_busy = false;
    this.attachEvents();
  }

  close() {
    this.is_open = false;
    this.overlay.close();
  }

  openRomWizard(sig = '') {
    if (!sig || !this.mod?.openRomWizard) {
      return;
    }
    let game = this.games.find((g) => g.sig === sig);
    this.mod.openRomWizard(sig, game?.title || '');
  }

  attachEvents() {
    let root = document.querySelector('.nwasm-arcade-overlay');
    if (!root) {
      return;
    }

    root.querySelectorAll('.launch').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        let sig = btn.getAttribute('data-sig');
        if (sig) {
          this.openRomWizard(sig);
        }
      };
    });

    root.querySelectorAll('.table .row').forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest('.launch')) {
          return;
        }
        e.preventDefault();
        let sig = row.getAttribute('data-sig');
        if (sig) {
          this.openRomWizard(sig);
        }
      };
      row.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          let sig = row.getAttribute('data-sig');
          if (sig) {
            this.openRomWizard(sig);
          }
        }
      };
    });

    this.attachUpload();
  }

  attachUpload() {
    let dropzone = document.getElementById('nwasm-arcade-upload');
    if (!dropzone) {
      return;
    }

    let setBusy = (message = 'Uploading…') => {
      this.upload_busy = true;
      dropzone.classList.add('busy');
      let state = dropzone.querySelector('.state');
      let status = dropzone.querySelector('.status');
      let prompt = dropzone.querySelector('.prompt');
      if (state) {
        state.hidden = false;
      }
      if (status) {
        status.textContent = message;
      }
      if (prompt) {
        prompt.hidden = true;
      }
    };

    let clearBusy = () => {
      this.upload_busy = false;
      dropzone.classList.remove('busy');
      let state = dropzone.querySelector('.state');
      let prompt = dropzone.querySelector('.prompt');
      if (state) {
        state.hidden = true;
      }
      if (prompt) {
        prompt.hidden = false;
      }
    };

    try {
      this.app.browser.addDragAndDropFileUploadToElement(
        'nwasm-arcade-upload',
        async (file, _is_drag, native_file) => {
          if (this.upload_busy) {
            return;
          }
          if (!file) {
            alert('Unable to read that ROM file.');
            return;
          }

          setBusy('Preparing upload…');
          this.mod.active_rom = file;
          this.mod.uploaded_rom = false;
          this.mod.active_rom_name = '';

          this.new_game_overlay.render({
            file,
            file_name: native_file?.name || 'Selected ROM'
          });
          clearBusy();
        },
        false,
        true
      );
    } catch (err) {
      console.log('Nwasm ArcadeOverlay upload error: ' + err);
      clearBusy();
    }
  }
}

module.exports = NwasmArcadeOverlay;
