const NewGameOverlayTemplate = require('./new-game.template');
const LibraryOverlay = require('./library');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class NewGameOverlay {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.library_overlay = new LibraryOverlay(app, mod);
    this.file = null;
    this.file_name = '';
    this.busy = false;
  }

  render(opts = {}) {
    this.busy = false;
    this.file = opts.file || null;
    this.file_name = opts.file_name || 'Selected ROM';
    this.overlay.show(NewGameOverlayTemplate());
    this.attach_events();
  }

  set_busy(message = 'Preparing…') {
    this.busy = true;
    let root = document.querySelector('.nwasm-new-game');
    let state = root?.querySelector('.state');
    let status = root?.querySelector('.state .status');
    let choices = root?.querySelector('.choices');

    if (choices) {
      choices.hidden = true;
    }
    if (state) {
      state.hidden = false;
    }
    if (status) {
      status.textContent = message;
    }
  }

  //
  // Double-rAF + short timeout: give the browser a real chance to paint before
  // CPU-bound emulator init freezes the main thread.
  //
  async wait_for_paint() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  attach_events() {
    let root = document.querySelector('.nwasm-new-game');
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-action="play"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        this.play_game();
      };
    });

    root.querySelectorAll('[data-action="library"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        this.open_library();
      };
    });
  }

  async play_game() {
    if (this.busy || !this.file) {
      return;
    }

    let mod = this.mod;

    if (!mod.is_nwasm_page()) {
      this.set_busy('Preparing emulator…');
      await this.wait_for_paint();
      this.overlay.hide();
      mod.queueEphemeralRomFromArcade(this.file, this.file_name);
      return;
    }

    this.set_busy('Preparing emulator…');
    await this.wait_for_paint();
    this.overlay.hide();

    let a = Buffer.from(this.file, 'binary').toString('base64');
    let ab = mod.convertBase64ToByteArray(a);
    await this.wait_for_paint();
    await mod.playEphemeralRom(ab, this.file_name, this.file);
  }

  open_library() {
    if (this.busy || !this.file) {
      return;
    }

    this.overlay.hide();
    this.library_overlay.render({
      file: this.file,
      file_name: this.file_name
    });
  }
}

module.exports = NewGameOverlay;
