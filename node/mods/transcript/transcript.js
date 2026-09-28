const ModTemplate = require('../../lib/templates/modtemplate');

class Transcript extends ModTemplate {
  constructor(app) {
    super(app);
    this.name = 'Transcript';
    this.slug = 'transcript';
    this.description = 'Local English transcript capture for Saito Talk';
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
        if (this.runtime) completion.push(this.runtime.beforeNavigate());
      });
      app.connection.on('videocall-stream', (peer, stream) => {
        this.runtime?.updateStream(peer, stream);
      });
      app.connection.on('videocall-peer-left', (peer) => this.runtime?.removePeer(peer));
      app.connection.on('videocall-ended', (completion) => {
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
          this.runtime = new TranscriptRuntime(this.app);
          return this.runtime;
        })
        .catch((error) => {
          this.loading = null;
          throw error;
        });
    }
    return this.loading;
  }

  respondTo(type, obj) {
    if (type !== 'call-actions' || !this.app.BROWSER) return null;
    const action = (text, icon, method) => ({
      text,
      icon,
      hook: `transcript-${method}-control`,
      callback: async () => {
        const generation = this.generation || 0;
        // Resume audio synchronously from the click, before loading any assets.
        let context;
        try {
          if (!this.runtime?.capturing) {
            context = this.runtime?.prepareAudio() || new AudioContext();
            context.resume().catch(() => {});
          }
          const runtime = await this.loadRuntime();
          if (generation !== (this.generation || 0)) {
            if (context && context !== runtime.engine?.context) context.close().catch(() => {});
            return;
          }
          const call = this.app.modules.returnModule('Videocall');
          if (!call?.streams?.active || call.room_obj?.call_id !== obj.call_id) {
            if (context && context !== runtime.engine?.context) context.close().catch(() => {});
            return;
          }
          await runtime[method](call, context);
        } catch (error) {
          if (context && context !== this.runtime?.engine?.context) context.close().catch(() => {});
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
    expressapp.use('/transcript', express.static(`${__dirname}/web`));
  }
}

module.exports = Transcript;
