module.exports = (msg, class_name = 'purchase-container') => {
  return `
    <div class="${class_name} saito-overlay-panel saito-overlay-size loader-interstitial-overlay">
      <header class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">Get Saito</h2>
      </header>
      <div class="container-body">
        <div class="saito-spinner" aria-hidden="true"></div>
        <p class="loader-status-msg">${msg}</p>
      </div>
    </div>
  `;
};
