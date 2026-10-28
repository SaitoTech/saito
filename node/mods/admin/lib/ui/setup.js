const NodeSetupTemplate = require('./setup.template');

class AdminSetup {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.selected_app = '';
    this.selected_choice = '';
    this.submitting = false;
    this.showing_recompile = false;
  }

  render() {
    this.app.browser.replaceElementContentBySelector(NodeSetupTemplate(this.mod), this.container);
    this.attachEvents();
    this.updateView();
  }

  updateView() {
    const root = document.querySelector(`${this.container} .node-setup`);
    if (!root) return;
    const busy = this.submitting || this.showing_recompile;
    root.querySelector('.node-setup-options').hidden = busy;
    root.querySelector('.splash-section').hidden = busy || !this.selected_choice;
    root.querySelector('.node-setup-working').hidden = !this.submitting;
    root.querySelector('.node-setup-dev-info').hidden =
      !this.showing_recompile || this.selected_choice !== 'development';
    root.querySelector('.node-setup-prod-info').hidden =
      !this.showing_recompile || this.selected_choice !== 'production';
    root.querySelector('h1').textContent = this.showing_recompile
      ? 'Ready for Command-Line Recompile'
      : 'I want to run a:';
    root.querySelectorAll('[data-choice]').forEach((button) => {
      button.disabled = busy;
      if (button.dataset.choice !== 'existing') {
        button.setAttribute('aria-pressed', String(button.dataset.choice === this.selected_choice));
      }
    });
    root.querySelectorAll('[data-app]').forEach((button) => {
      button.disabled = busy || !this.selected_choice;
      button.classList.toggle('selected', button.dataset.app === this.selected_app);
    });
  }

  showError(error) {
    this.submitting = false;
    this.updateView();
    siteMessage('Node setup could not be saved.', 5000);
    salert(error);
  }

  attachEvents() {
    document.querySelectorAll('.splash-card').forEach((card) => {
      card.onclick = async () => {
        if (!this.selected_choice || this.submitting || this.showing_recompile) return;
        this.selected_app = card.dataset.app;
        this.submitting = true;
        this.updateView();
        siteMessage('Customizing your Node Setup...');
        try {
          const currentOptions = JSON.parse(JSON.stringify(this.mod.server_info?.options || {}));
          const updatedOptions = this.configureOptionsForChoice(currentOptions, this.selected_choice);
          await this.submitOptions(updatedOptions);
        } catch (err) {
          this.showError(err.message || String(err));
        }
      };
    });

    const containerEl = document.querySelector(this.container);
    if (containerEl) {
      containerEl.onclick = (e) => {
        const copyBtn = e.target.closest('.admin-copy-cmd');
        if (!copyBtn) {
          return;
        }
        const cmd = copyBtn.dataset.cmd;
        if (cmd) {
          navigator.clipboard.writeText(cmd).then(() => {
            if (typeof siteMessage === 'function') {
              siteMessage('command copied to clipboard...', 2000);
            }
          });
        }
      };
    }

    document.querySelectorAll('.node-setup-card').forEach((card) => {
      card.onclick = async () => {
        if (this.submitting || this.showing_recompile) return;
        const choice = card.dataset.choice;

        if (choice === 'existing') {
          this.submitting = true;
          this.updateView();
          siteMessage('Saving node setup...');
          try {
            await this.submitOptions({ isSetupComplete: true }, false);
          } catch (err) {
            this.showError(err.message || String(err));
          }
          return;
        }

        this.selected_choice = choice;
        this.selected_app = '';
        this.updateView();
      };
    });
  }

  configureOptionsForChoice(options, choice) {
    options.isSetupComplete = true;
    options.defaultModule = this.selected_app;

    if (choice === 'development') {
      options.consensus = options.consensus || {};
      options.consensus.disable_block_production = false;
      options.consensus.default_social_stake = 0;
      options.consensus.default_social_stake_period = 0;
    }

    if (choice === 'production') {
      options.consensus = options.consensus || {};
      options.consensus.disable_block_production = true;
      options.peers = [
        {
          host: 'eames.saito.io',
          port: '443',
          protocol: 'https',
          synctype: 'full'
        }
      ];
    }

    return options;
  }

  async submitOptions(options, showRecompile = true) {
    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );

    tx.msg = {
      module: 'Admin',
      request: 'update-options',
      data: options
    };

    await tx.sign();

    await this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        // Transport failures arrive as plain { err } objects, not transactions.
        const res = typeof res_tx.returnMessage === 'function' ? res_tx.returnMessage() : res_tx;
        if (res?.err) {
          this.showError(res.err);
          return;
        }

        this.submitting = false;
        this.mod.server_info = this.mod.server_info || {};
        this.mod.server_info.options = { ...this.mod.server_info.options, ...options };
        this.showing_recompile = showRecompile;
        if (showRecompile) {
          this.updateView();
        } else {
          this.mod.main.render('overview');
        }
        siteMessage('Node setup saved.', 5000);
      },
      this.mod.server_publickey
    );
  }
}

module.exports = AdminSetup;
