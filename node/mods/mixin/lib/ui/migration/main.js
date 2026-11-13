const MigrationMainTemplate = require('./main.template');

class MigrationMain {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.reservationTimer = null;
  }

  async render() {
    if (document.querySelector('.main')) {
      this.app.browser.replaceElementBySelector(MigrationMainTemplate(this.mod), '.main');
    } else {
      this.app.browser.addElementToDom(MigrationMainTemplate(this.mod));
    }
    this.attachEvents();
    this.renderDepositQrCode();
    this.startReservationCountdown();
  }

  renderDepositQrCode() {
    const address = this.mod.migration_instructions?.address;
    if (!address || !document.getElementById('migration-qrcode')) {
      return;
    }
    if (typeof this.app.browser.generateQRCode === 'function') {
      this.app.browser.generateQRCode(address, 'migration-qrcode');
      const svg = document.querySelector('.migration-qrcode svg');
      svg?.classList.add('saito-qr-border');
      const modules = Number(svg?.getAttribute('viewBox')?.split(/\s+/)[2]);
      if (modules > 0) {
        // Include one white module on each side in the border-box size.
        svg.style.setProperty('--migration-qr-total-modules', modules + 2);
      }
    }
  }

  startReservationCountdown() {
    clearInterval(this.reservationTimer);
    this.reservationTimer = null;
    const countdown = document.getElementById('migration-time-left');
    const reservedUntil = Number(this.mod.migration_instructions?.reserved_until || 0);
    if (!countdown || !Number.isFinite(reservedUntil) || reservedUntil <= 0) {
      return;
    }

    const update = () => {
      if (!countdown.isConnected) {
        clearInterval(this.reservationTimer);
        this.reservationTimer = null;
        return;
      }
      const seconds = Math.max(0, Math.ceil((reservedUntil - Date.now()) / 1000));
      countdown.textContent = [
        Math.floor(seconds / 3600),
        Math.floor((seconds % 3600) / 60),
        seconds % 60
      ].map((value) => String(value).padStart(2, '0')).join(':');
      if (seconds === 0) {
        clearInterval(this.reservationTimer);
        this.reservationTimer = null;
      }
    };
    this.reservationTimer = setInterval(update, 1000);
    update();
  }

  attachEvents() {
    const title = document.querySelector('#migration-title');
    const tickerSelect = document.querySelector('#wrapped-saito-ticker');
    tickerSelect?.addEventListener('change', () => {
      if (title) {
        title.textContent =
          tickerSelect.value === 'BEP-SAITO' ? 'Migrate BEP20 SAITO' : 'Migrate ERC20 SAITO';
      }
    });

    const depositAddress = document.querySelector('#migration-deposit-address');
    if (depositAddress) {
      depositAddress.onclick = () => {
        const address = this.mod.migration_instructions?.address || '';
        if (!address || typeof navigator?.clipboard?.writeText !== 'function') {
          return;
        }
        navigator.clipboard.writeText(address);
        const icon = depositAddress.querySelector('i');
        if (!icon) {
          return;
        }
        icon.classList.toggle('fa-copy');
        icon.classList.toggle('fa-check');
        setTimeout(() => {
          icon.classList.toggle('fa-copy');
          icon.classList.toggle('fa-check');
        }, 800);
      };
    }

    const extend = document.querySelector('#migration-extend-reservation');
    if (extend) {
      extend.onclick = async (event) => {
        event.preventDefault();
        if (extend.dataset.busy === '1') {
          return;
        }
        extend.dataset.busy = '1';
        try {
          const response = await this.mod.requestMigrationExtend(
            this.mod.migration_instructions?.id
          );
          if (response?.error) {
            throw new Error(response.error);
          }
          this.mod.receiveMigrationInstructions(response);
        } catch (err) {
          salert(err?.message || 'Unable to extend the reservation');
          extend.dataset.busy = '0';
        }
      };
    }

    const button = document.querySelector('#migrate');
    if (!button) {
      return;
    }

    button.onclick = async () => {
      const publickey = document.querySelector('#publickey')?.value?.trim() || '';
      const ticker = document.querySelector('#wrapped-saito-ticker')?.value || 'ERC-SAITO';

      if (!publickey) {
        salert('Enter the Saito address that should receive the tokens.');
        return;
      }
      if (publickey !== this.mod.publicKey) {
        salert(
          'The publickey provided is not the publickey of this wallet. To avoid problems please request token withdrawal from the wallet which will receive the tokens'
        );
        return;
      }
      if (ticker !== 'ERC-SAITO' && ticker !== 'BEP-SAITO') {
        salert('Select ERC20 SAITO or BEP20 SAITO.');
        return;
      }

      button.disabled = true;
      try {
        const backup = await sconfirm('Migration will move assets into your wallet. Backup wallet?');
        if (backup) {
          await this.app.wallet.backupWallet();
        }
        const response = await this.mod.requestMigration({
          publickey,
          ticker
        });
        this.mod.wrapped_saito_ticker = ticker;
        this.mod.receiveMigrationInstructions(response);
      } catch (err) {
        salert(err?.message || 'Migration request failed');
        button.disabled = false;
      }
    };
  }
}

module.exports = MigrationMain;
