const WalletHistoryTemplate = require('./wallet-history.template');
const SaitoOverlay = require('./../../saito-overlay/saito-overlay');

class WalletHistory {
  constructor(app, mod) {
    this.app = app;
    this.mod = mod;
    this.overlay = new SaitoOverlay(app, mod);

    app.connection.on('saito-crypto-wallet-history-render-request', ({ ticker } = {}) => {
      this.ticker = ticker || this.app.wallet.returnPreferredCryptoTicker();
      this.mod = this.app.wallet.returnCryptoModuleByTicker(this.ticker);
      this.render();
    });

    for (const event of [
      'on-transaction-pending',
      'wallet-updated',
      'on-payment-sent',
      'on-payment-received'
    ]) {
      app.connection.on(event, () => {
        if (this.overlay.visible) {
          this.formatHistory();
        }
      });
    }
  }

  getExplorerUrl() {
    if (this.ticker !== 'SAITO') {
      return '';
    }

    const key = this.app.wallet?.publicKey || this.app.wallet?.returnPublicKey?.() || '';
    return key ? `/explorer/address/${encodeURIComponent(key)}` : '/explorer';
  }

  render() {
    this.overlay.show(WalletHistoryTemplate(this.mod, this.getExplorerUrl()));
    this.formatHistory();
    this.attachEvents();
  }

  formatHistory() {
    let historyHtml = `
      <div class="transaction-history-table saitox-table" data-crypto="${this.mod.ticker}">
        <div class="saitox-header-item">Time</div>
        <div class="saitox-header-item">Type</div>
        <div class="saitox-header-item">Amount</div>
        <div class="saitox-header-item">Balance</div>
        <div class="saitox-header-item">To/From</div>
        <div class="saitox-header-item saito-only">Memo</div>
    `;
    let runningBalance = Number(this.mod.returnDisplayBalance());
    let day = new Date().toDateString();
    let lastTimestamp = 0;

    if (this.mod.history?.length > 0) {
      if (this.mod.last_balance) {
        const difference = runningBalance - Number(this.mod.last_balance);
        historyHtml += `<div class="crypto-timestamp"></div>
          <div class="crypto-type-italic">pending</div>
          <div class="crypto-amount">${this.app.browser.formatDecimals(difference)}</div>
          <div class="crypto-amount">${this.app.browser.formatDecimals(runningBalance)}</div>
          <div></div>
          <div class="saito-only"></div>`;

        runningBalance -= difference;
        runningBalance = Number(runningBalance.toFixed(8));
      }

      for (let i = this.mod.history.length - 1; i >= 0; i--) {
        const entry = this.mod.history[i];
        if (entry.timestamp === lastTimestamp) {
          continue;
        }

        lastTimestamp = entry.timestamp;
        const timestamp = new Date(entry.timestamp);

        if (timestamp.toDateString() !== day) {
          day = timestamp.toDateString();
          historyHtml += `<div class="saitox-table-break">${day}</div>`;
        }

        historyHtml += `<div class="crypto-timestamp">${timestamp.toLocaleTimeString()}</div>
          <div class="crypto-type">${entry.type}</div>
          <div class="crypto-amount">${this.app.browser.formatDecimals(entry.amount)}</div>
          <div class="crypto-amount">${this.app.browser.formatDecimals(runningBalance)}</div>`;

        if (entry.counter_party?.publicKey) {
          historyHtml += this.app.browser.returnAddressHTML(entry.counter_party.publicKey);
        } else if (entry.counter_party?.address) {
          if (entry.counter_party.address.indexOf('-') > 0) {
            const addressParts = entry.counter_party.address.split('-');
            historyHtml += `<div class="crypto-address" title="mixin internal address">${addressParts[0]}--${addressParts[addressParts.length - 1]}</div>`;
          } else {
            historyHtml += `<div class="crypto-address" data-address="${entry.counter_party.address}">${entry.counter_party.address.slice(0, 6)}...${entry.counter_party.address.slice(-8)}</div>`;
          }
        } else {
          historyHtml += '<div></div>';
        }

        historyHtml += `<div class="saito-only">${entry.memo || ''}</div>`;
        runningBalance -= Number(entry.amount);
        runningBalance = Number(runningBalance.toFixed(8));
      }
    }

    if (runningBalance > 0) {
      historyHtml += `<div class="crypto-timestamp"></div>
        <div class="crypto-type">deposit</div>
        <div class="crypto-amount">${this.app.browser.formatDecimals(runningBalance)}</div>
        <div class="crypto-amount">${this.app.browser.formatDecimals(runningBalance)}</div>
        <div class="crypto-address">Starting balance</div>
        <div class="saito-only"></div>`;
    }

    historyHtml += '</div>';
    this.app.browser.replaceElementBySelector(
      historyHtml,
      '.wallet-history .transaction-history-table'
    );
  }

  attachEvents() {
    const refreshButton = document.getElementById('wallet-history-refresh');
    if (refreshButton) {
      refreshButton.onclick = () => {
        this.mod.fetchHistory(0, () => this.formatHistory());
      };
    }

    const explorerLink = document.getElementById('wallet-history-explorer');
    if (explorerLink) {
      explorerLink.onclick = () => this.overlay.close();
    }
  }
}

module.exports = WalletHistory;
