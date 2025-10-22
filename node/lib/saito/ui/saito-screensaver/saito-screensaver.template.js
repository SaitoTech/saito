module.exports = (details) => {
  return `
  <div class="saito-screensaver">
  <h2>Device Hibernating</h2>
  <div class="saito-info">Your public key ${details.recipient} is logged in on another device. This browser will remain in a sleep state so that you don't accidentally send duplicate transactions from multiple lite nodes. Click 'Reconnect' to switch control back to this device.</div>
  <div class="saito-info-box">Device: ${details.device}</div>
  <button id="wake-up-button" class="saito-button-primary">Reconnect</button>
  </div>
  `;
};
