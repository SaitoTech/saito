const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoOverlay = require('../../lib/saito/ui/saito-overlay/saito-overlay');

class Transcript extends ModTemplate {
  constructor(app) {
    super(app);
    this.name = 'Transcript';
    this.slug = 'transcript';
    this.description = 'Local multilingual transcript capture for Saito Talk';
    this.categories = 'Utilities Communications';
    this.status = 'alpha';
    this.class = 'utility';
    this.icon = 'fa-solid fa-file-lines';
    this.runtime = null;
    this.loading = null;

    if (app.BROWSER) {
      const recover = () => {
        this.loadRuntime()
          .then((runtime) => runtime.recover())
          .catch((error) => console.error('Transcript recovery:', error));
      };
      app.connection.on('videocall-opened', recover);
      app.connection.on('show-call-interface', () => {
        recover();
        // The call UI may be replaced when switching between video and audio.
        setTimeout(() => this.runtime?.render(), 0);
      });
      app.connection.on('saito-before-navigate', (completion) => {
        this.generation = (this.generation || 0) + 1;
        this.actionOverlay?.close();
        if (this.runtime) completion.push(this.runtime.beforeNavigate());
      });
      app.connection.on('videocall-stream', (peer, stream) => {
        this.runtime?.updateStream(peer, stream);
      });
      app.connection.on('videocall-peer-left', (peer) => this.runtime?.removePeer(peer));
      app.connection.on('videocall-ended', (completion) => {
        this.actionOverlay?.close();
        // Also invalidate an import/model load if the call ends while it is loading.
        this.generation = (this.generation || 0) + 1;
        if (this.runtime) completion.push(this.runtime.endCall());
      });
    }
  }

  async loadRuntime() {
    if (!this.loading) {
      this.loading = import(/* webpackIgnore: true */ '/transcript/runtime.mjs')
        .then(({ TranscriptRuntime }) => {
          this.runtime = new TranscriptRuntime(this.app, {
            createOverlay: () => new SaitoOverlay(this.app, this)
          });
          return this.runtime;
        })
        .catch((error) => {
          this.loading = null;
          throw error;
        });
    }
    return this.loading;
  }

  showActionMenu(runtime, call) {
    if (this.actionOverlay?.visible) return;
    const generation = this.generation || 0;
    const callId = call.room_obj.call_id;
    const trigger = document.querySelector('.transcript-toggle-control');
    const overlay = new SaitoOverlay(this.app, this);
    this.actionOverlay = overlay;
    const keydown = (event) => {
      if (event.key === 'Escape') overlay.close();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button')];
        buttons[(buttons.indexOf(document.activeElement) + 1) % buttons.length].focus();
      }
    };
    overlay.show(
      `
      <div class="saito-modal transcript-action-menu" role="dialog" aria-label="Transcript">
        <div class="saito-modal-title">Transcript</div>
        <div class="saito-modal-content saito-menu-select-heavy" role="menu" aria-label="Transcript actions">
          <button type="button" class="saito-modal-menu-option" role="menuitem" data-action="start"><i class="fa-solid fa-play" aria-hidden="true"></i><span>Start</span></button>
          <button type="button" class="saito-modal-menu-option" role="menuitem" data-action="settings"><i class="fa-solid fa-gear" aria-hidden="true"></i><span>Settings</span></button>
        </div>
      </div>`,
      () => {
        document.removeEventListener('keydown', keydown);
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.focus();
      }
    );
    const menu = document.querySelector(`#saito-overlay${overlay.ordinal} .transcript-action-menu`);
    trigger?.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', keydown);
    menu.querySelector('button').focus();
    menu.querySelectorAll('button').forEach((button) => {
      button.onclick = async () => {
        overlay.close();
        if (
          generation !== (this.generation || 0) ||
          !call.streams.active ||
          call.room_obj.call_id !== callId
        )
          return;
        let context;
        try {
          if (button.dataset.action === 'settings') {
            await runtime.openSettings();
            if (
              generation === (this.generation || 0) &&
              call.streams.active &&
              call.room_obj.call_id === callId &&
              !runtime.capturing &&
              !runtime.finishing
            )
              this.showActionMenu(runtime, call);
          } else {
            // Preserve the Start click's user gesture for browser audio playback.
            context = runtime.prepareAudio();
            await runtime.configureAndToggle(call, context);
          }
        } catch (error) {
          if (context && context !== runtime.engine?.context) context.close().catch(() => {});
          console.error('Transcript:', error);
          globalThis.siteMessage?.(
            'Transcript could not start. Check speech model settings.',
            5000
          );
        }
      };
    });
  }

  respondTo(type, obj) {
    if (type !== 'call-actions' || !this.app.BROWSER) return null;
    const action = (text, icon, method) => ({
      text,
      icon,
      hook: `transcript-${method}-control`,
      callback: async () => {
        const generation = this.generation || 0;
        try {
          const runtime = await this.loadRuntime();
          if (generation !== (this.generation || 0)) {
            return;
          }
          const call = this.app.modules.returnModule('Videocall');
          if (!call?.streams?.active || call.room_obj?.call_id !== obj.call_id) {
            return;
          }
          if (runtime.capturing || runtime.finishing) await runtime.toggle(call);
          else this.showActionMenu(runtime, call);
        } catch (error) {
          console.error('Transcript:', error);
          siteMessage(
            'Transcript could not start. Check that the transcript assets are installed.',
            5000
          );
        }
      },
      event: (id) => {
        const button = document.getElementById(id);
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-label', text);
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            button.click();
          }
        };
        this.runtime?.render();
      }
    });
    return [action('Transcript', this.icon, 'toggle')];
  }

  webServer(app, expressapp, express) {
    // Old deployments may still contain weights. Models are client downloads only.
    expressapp.use('/transcript/models', (_req, res) => res.sendStatus(404));
    expressapp.use('/transcript', express.static(`${__dirname}/web`));
  }
}

module.exports = Transcript;
