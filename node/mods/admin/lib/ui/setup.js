const NodeSetupTemplate = require('./setup.template');

class AdminSetup {
  constructor(app, mod, container = '.saito-container') {
    this.app = app;
    this.mod = mod;
    this.container = container;
    this.selected_app = '';
    this.showing_recompile = false;
    this.use_existing_config = false;
  }

  render() {
    this.app.browser.replaceElementContentBySelector(NodeSetupTemplate(this.mod), this.container);
    this.attachEvents();
  }

  attachEvents() {
    document.querySelectorAll('.splash-card').forEach((card) => {
      card.onclick = () => {
        document.querySelectorAll('.splash-card').forEach((el) => {
          el.classList.remove('selected');
        });
        card.classList.add('selected');
        this.selected_app = card.dataset.app;
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
        const choice = card.dataset.choice;

        if (choice === 'existing') {
          this.use_existing_config = true;
          this.mod.main.render('overview');
          return;
        }

        if (!this.selected_app) {
          salert('Please pick the module for your server root first.');
          return;
        }

        document.querySelectorAll('.node-setup-options').forEach((el) => {
          el.style.display = 'none';
        });
        document.querySelector('.splash-section').style.display = 'none';
        document.querySelector('.node-setup-explainer').style.display = 'none';
        document.querySelectorAll('.node-setup-info').forEach((el) => {
          el.style.display = 'none';
        });
        document.querySelector('.node-setup-working').style.display = 'flex';

        siteMessage('Customizing your Node Setup...');

        const currentOptions = JSON.parse(JSON.stringify(this.mod.server_info?.options || {}));
        const updatedOptions = this.configureOptionsForChoice(currentOptions, choice);
        await this.submitOptions(updatedOptions, choice);
      };
    });
  }

  configureOptionsForChoice(options, choice) {
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

  async submitOptions(options, choice) {
    let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
      this.mod.server_publickey
    );

    tx.msg = {
      module: 'Admin',
      request: 'update-options',
      data: options
    };

    await tx.sign();

    this.app.network.sendTransactionWithCallback(
      tx,
      (res_tx) => {
        let res = res_tx.returnMessage();
        document.querySelector('.node-setup-working').style.display = 'none';

        if (res?.err) {
          salert(res.err);
          document.querySelectorAll('.node-setup-options').forEach((el) => {
            el.style.display = '';
          });
          document.querySelector('.splash-section').style.display = '';
          document.querySelector('.node-setup-explainer').style.display = '';
          document.querySelectorAll('.node-setup-info').forEach((el) => {
            el.style.display = '';
          });
          return;
        }

        this.showing_recompile = true;
        document.querySelector('.node-setup h1').innerText = 'Ready for Command-Line Recompile';
        if (choice === 'production') {
          document.querySelector('.node-setup-prod-info').style.display = 'block';
        } else {
          document.querySelector('.node-setup-dev-info').style.display = 'block';
        }
      },
      this.mod.server_publickey
    );
  }
}

module.exports = AdminSetup;
