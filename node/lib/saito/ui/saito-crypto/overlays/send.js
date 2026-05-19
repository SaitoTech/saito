/**
 * Entry point for legacy `saito-crypto-send-render-request` (games / gametemplate).
 *
 * After splitting the old combined overlay, **Send** only validates and forwards to
 * **Confirm** via `saito-crypto-send-confirm-open-request` so `mycallback` runs exactly once
 * (Confirm orchestrates display + payment trigger).
 */
class Send {
  constructor(app, mod, container = '') {
    this.app = app;
    this.mod = mod;

    this.app.connection.on('saito-crypto-send-render-request', (details) => {
      this.render(details);
    });
  }

  /**
   * Validates the legacy payload and opens the Confirm overlay (single subscriber for payment start).
   * @param details same shape as gametemplate `payWinner` / queue SEND payloads
   */
  render(details) {
    if (!details?.ticker || !details?.amount) {
      console.error('Missing ticker/amount in Send Crypto Overlay');
      return;
    }

    if (!details?.publicKey || !details?.address) {
      console.error('Missing address in Send Crypto Overlay');
      return;
    }

    this.app.connection.emit('saito-crypto-send-confirm-open-request', details);
  }
}

module.exports = Send;
