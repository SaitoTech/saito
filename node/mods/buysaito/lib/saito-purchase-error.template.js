module.exports = (message = '') => {
  const escapedMessage = String(message)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  if (escapedMessage) {
    return `
      <div class="saito-purchase-error saito-overlay-panel saito-overlay-size narrow loader-interstitial-overlay">
        <div class="container-header">Payment Instructions Unavailable</div>
        <div class="container-body">${escapedMessage}</div>
        <div class="container-footer">Please close this notice and try again.</div>
      </div>
    `;
  }

  return `
    <div class="saito-purchase-error saito-overlay-panel saito-overlay-size narrow loader-interstitial-overlay">
      <div class="container-header">Friendly Notice</div> 
      <div class="container-body">Due to heavy use, the hot wallet will need to be refilled to complete your purchase.</div>
      <div class="container-body">The team have been notified and will resupply the hot wallet as soon as possible.</div>
      <div class="container-footer">Contact <a target="_blank" href="mailto:support@saito.io">support@saito.io</a> or DM <span class='saito-mention saito-address' data-id="i767FqhGcKPzqi7KcWNA8TQoTZeBd8QbWd2mTKNnkfmk">omskian@saito</span> for assistance.
      </div>
    </div>
  `;
};
