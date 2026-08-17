const LibraryOverlayTemplate = require('./library.template');
const SaitoOverlay = require('../../../../../lib/saito/ui/saito-overlay/saito-overlay');

class LibraryOverlay {
  constructor(app, mod = null) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod, false);
    this.file = null;
    this.file_name = '';
    this.game_data = null;
    this.busy = false;
    this.create_nft_overlay = null;
  }

  async render(opts = {}) {
    this.busy = false;
    this.file = opts.file || null;
    this.file_name = opts.file_name || 'Selected ROM';
    this.game_data = opts.game_data || null;

    if (!this.file) {
      alert('No ROM selected.');
      return;
    }

    try {
      if (!this.game_data) {
        this.game_data = await this.mod.createGameData(this.file, this.file_name);
      }
    } catch (err) {
      console.log('Error building N-WASM game data: ' + err);
      alert('Unable to prepare game data for library save.');
      return;
    }

    let actions = this.collect_actions();
    this.overlay.show(LibraryOverlayTemplate(actions));
    this.attach_events(actions);
  }

  collect_actions() {
    let ctx = {
      file: this.file,
      file_name: this.file_name,
      game_data: this.game_data
    };

    let actions = [
      {
        id: 'local-archive',
        title: 'Save to Local Archive',
        description: 'Save your game locally.',
        image: '/nwasm/img/save_to_archive.png',
        rank: 10,
        callback: async (app, mod, context) => {
          let tx = await mod.saveGameToArchive(context.game_data);
          await mod.addGame(tx, {
            source: 'archive',
            title: context.game_data?.name || context.file_name
          });
          return { source: 'archive', tx };
        }
      },
      {
        id: 'convert-nft',
        title: 'Convert to NFT',
        description: 'Create an on-chain NFT for your game.',
        image: '/nwasm/img/digitize_as_nft.png',
        rank: 30,
        callback: async (app, mod, context) => {
          return await this.open_create_nft(context);
        }
      }
    ];

    let peers = this.app.modules?.getRespondTos?.('nwasm-library-actions', ctx) || [];
    for (let i = 0; i < peers.length; i++) {
      let peer = peers[i];
      if (!peer?.id || !peer?.title || !peer?.callback) {
        continue;
      }
      if (actions.find((a) => a.id === peer.id)) {
        continue;
      }
      actions.push({
        id: peer.id,
        title: peer.title,
        description: peer.description || '',
        image: peer.image || '',
        rank: typeof peer.rank === 'number' ? peer.rank : 20,
        //
        // Wrap peer actions (Vault) so N-WASM always registers the resulting
        // game through addGame() before the Library re-renders.
        //
        callback: async (app, mod, context) => {
          let result = await peer.callback(app, mod, context);
          if (peer.id === 'vault-upload') {
            await mod.addGameFromVaultResult(context, result || {});
            return { source: 'vault', result };
          }
          return result;
        }
      });
    }

    actions.sort((a, b) => (a.rank || 0) - (b.rank || 0));
    return actions;
  }

  root() {
    return document.querySelector('.nwasm-library');
  }

  async wait_for_paint() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  set_controls_enabled(enabled) {
    let root = this.root();
    if (!root) {
      return;
    }
    root.querySelectorAll('.choice').forEach((btn) => {
      btn.disabled = !enabled;
      btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    });
  }

  set_progress_state({
    mode = 'busy',
    lede = 'Working…',
    status = 'Preparing…',
    action_id = ''
  } = {}) {
    let root = this.root();
    if (!root) {
      return;
    }

    this.busy = mode === 'busy';
    root.classList.toggle('is-busy', mode === 'busy');
    root.classList.toggle('is-success', mode === 'success');
    root.classList.toggle('is-error', mode === 'error');
    this.set_controls_enabled(mode === 'error');

    root.querySelectorAll('.choice').forEach((btn) => {
      btn.classList.toggle(
        'is-active',
        mode === 'busy' && !!action_id && btn.dataset.action === action_id
      );
    });

    let state = root.querySelector('.state');
    let lede_el = root.querySelector('.state .lede');
    let status_el = root.querySelector('.state .status');
    let choices = root.querySelector('.choices');

    if (choices) {
      //
      // Once a strategy has been chosen, keep the strategy cards hidden for
      // busy, success, and error. Do not return the user to strategy selection
      // on failure — they can close and start a new upload to choose again.
      //
      choices.hidden = true;
    }
    if (state) {
      state.hidden = false;
    }
    if (lede_el) {
      lede_el.textContent = lede;
    }
    if (status_el) {
      status_el.textContent = status;
    }
  }

  set_busy(message = 'Saving…', action_id = '') {
    this.set_progress_state({
      mode: 'busy',
      lede: 'Saving…',
      status: message,
      action_id
    });
  }

  set_success(message = 'Saved to Local Archive') {
    this.set_progress_state({
      mode: 'success',
      lede: 'Saved to Local Archive',
      status: message
    });
  }

  set_error(message = 'Unable to save. Please try again.') {
    this.set_progress_state({
      mode: 'error',
      lede: 'Save failed',
      status: message
    });
  }

  success_copy(action_id = '') {
    if (action_id === 'vault-upload') {
      return {
        lede: 'Uploaded to Vault',
        status: 'Your ROM is ready in the library.',
        toast: 'Game uploaded to Vault'
      };
    }
    if (action_id === 'convert-nft') {
      return {
        lede: 'Digitized as NFT',
        status: 'Your ROM is ready in the library.',
        toast: 'Game digitized as NFT'
      };
    }
    return {
      lede: 'Saved to Local Archive',
      status: 'Your ROM is ready in the library.',
      toast: 'Game saved to Local Archive'
    };
  }

  busy_copy(action_id = '') {
    if (action_id === 'local-archive') {
      return 'Saving to Local Archive…';
    }
    if (action_id === 'vault-upload') {
      return 'Uploading to Vault…';
    }
    if (action_id === 'convert-nft') {
      return 'Digitizing as NFT…';
    }
    return 'Working…';
  }

  async refresh_library_ui() {
    if (this.mod.ui?.render) {
      await this.mod.ui.render();
      this.mod.ui.show?.();
    }
    if (this.mod.arcade_overlay?.is_open) {
      await this.mod.arcade_overlay.refresh();
    }
  }

  attach_events(actions = []) {
    let root = this.root();
    if (!root) {
      return;
    }

    let ctx = {
      file: this.file,
      file_name: this.file_name,
      game_data: this.game_data
    };

    for (let i = 0; i < actions.length; i++) {
      let action = actions[i];
      let btn = root.querySelector(`[data-action="${action.id}"]`);
      if (!btn) {
        continue;
      }
      btn.onclick = async (e) => {
        e.preventDefault();
        if (this.busy) {
          return;
        }

        let registers_library_game =
          action.id === 'local-archive' ||
          action.id === 'vault-upload' ||
          action.id === 'convert-nft';

        try {
          this.set_busy(this.busy_copy(action.id), action.id);
          await this.wait_for_paint();

          //
          // Action callbacks that register games call Nwasm.addGame() (or
          // addGameFromVaultResult) before returning. Only then do we render.
          //
          await action.callback(this.app, this.mod, ctx);

          if (registers_library_game) {
            // NFT / Vault may have hidden this overlay; restore for success UI.
            this.ensure_overlay_visible(actions);

            let copy = this.success_copy(action.id);
            this.set_progress_state({
              mode: 'success',
              lede: copy.lede,
              status: copy.status
            });
            await this.wait_for_paint();

            // Registration (addGame) already happened inside the action callback.
            await this.refresh_library_ui();

            await new Promise((resolve) => setTimeout(resolve, 1100));
            this.overlay.hide();
            siteMessage(copy.toast, 3000);
            return;
          }

          this.overlay.hide();
        } catch (err) {
          console.log('Library action error: ' + err);
          this.ensure_overlay_visible(actions);
          this.set_error(err?.message || 'Unable to complete library action.');
        }
      };
    }
  }

  ensure_overlay_visible(actions = null) {
    if (this.root()) {
      return;
    }
    let list = actions || this.collect_actions();
    this.overlay.show(LibraryOverlayTemplate(list));
    this.attach_events(list);
  }

  async open_create_nft(ctx) {
    let nft_cap = this.mod.respondTo('saito-create-nft');
    if (!nft_cap?.class?.[0]) {
      throw new Error('N64 ROM NFT type is unavailable.');
    }

    let create_nft =
      this.mod.header?.select_nft_overlay?.create_nft_overlay || null;

    if (!create_nft) {
      if (!this.create_nft_overlay) {
        const CreateNFT = require('../../../../../lib/saito/ui/saito-nft/overlays/create-overlay');
        this.create_nft_overlay = new CreateNFT(this.app, this.mod);
      }
      create_nft = this.create_nft_overlay;
    }

    //
    // Hide the choice cards while Create NFT runs, but keep this overlay's
    // promise open until mint finishes so we can addGame() before Library render.
    //
    this.overlay.hide();

    return await new Promise((resolve, reject) => {
      create_nft.render({
        type: nft_cap.class[0],
        quantity: 1,
        locked: ['type', 'quantity'],
        file: ctx.game_data.file,
        file_name: ctx.file_name || ctx.game_data.name,
        callback: async (result) => {
          try {
            if (!result || result.status === 'cancelled') {
              reject(new Error('NFT creation cancelled'));
              return;
            }
            if (result.status !== 'created' || !result.tx) {
              reject(new Error('NFT creation did not produce a game transaction'));
              return;
            }

            //
            // Mint txmsg.data is the canonical N-WASM game object (ROM included).
            // Persist + register before Library re-render.
            //
            await this.mod.addGame(result.tx, {
              source: 'nft',
              title: ctx.game_data?.name || ctx.file_name,
              id: result.nft_id || result.signature || result.tx.signature
            });

            resolve({ source: 'nft', result });
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });
    });
  }
}

module.exports = LibraryOverlay;
