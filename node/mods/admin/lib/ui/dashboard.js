const DashboardTemplate = require('./dashboard.template');

class AdminDashboard {
  constructor(app, mod, container = '.admin-dashbox') {
    this.app = app;
    this.mod = mod;
    this.container = container;
  }

  render() {
    if (!document.querySelector('.admin-dashboard')) {
      this.app.browser.addElementToSelector(DashboardTemplate(this.mod), this.container);
    } else {
      this.app.browser.replaceElementBySelector(DashboardTemplate(this.mod), this.container);
    }

    this.attachEvents();
  }

  attachEvents() {
    //
    // Enable block production (immediate)
    //
    const blockBtn = document.getElementById('block-production-btn');
    if (blockBtn && !blockBtn.classList.contains('enabled')) {
      blockBtn.onclick = async () => {
        blockBtn.textContent = 'Enabling…';
        blockBtn.setAttribute('disabled', true);

        let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
          this.mod.server_publickey
        );

        tx.msg = {
          module: 'Admin',
          request: 'update-options',
          data: {
            consensus: { disable_block_production: false }
          }
        };

        await tx.sign();

        this.app.network.sendTransactionWithCallback(
          tx,
          (res_tx) => {
            let res = res_tx.returnMessage();
            if (res?.err) {
              salert(res.err);
              blockBtn.removeAttribute('disabled');
              blockBtn.textContent = 'Enable Block Production';
            } else {
              siteMessage('Block production enabled');
              reloadWindow(1200);
            }
          },
          this.mod.server_publickey
        );
      };
    }

    //
    // block production toggle
    //
    this.attachBlockProductionHandler();
  }

  attachBlockProductionHandler() {
    const btn = document.getElementById('block-production-btn');
    if (!btn) return;

    const isEnabled = btn.classList.contains('enabled');

    btn.onclick = async () => {
      btn.textContent = 'Updating…';
      btn.setAttribute('disabled', true);

      let tx = await this.app.wallet.createUnsignedTransactionWithDefaultFee(
        this.mod.server_publickey
      );

      tx.msg = {
        module: 'Admin',
        request: 'update-options',
        data: {
          consensus: {
            disable_block_production: isEnabled ? true : false
          }
        }
      };

      await tx.sign();

      this.app.network.sendTransactionWithCallback(
        tx,
        (res_tx) => {
          let res = res_tx.returnMessage();
          if (res?.err) {
            salert(res.err);
            reloadWindow(1200); // reset state on failure too
          } else {
            reloadWindow(1200);
          }
        },
        this.mod.server_publickey
      );
    };
  }
}

module.exports = AdminDashboard;
