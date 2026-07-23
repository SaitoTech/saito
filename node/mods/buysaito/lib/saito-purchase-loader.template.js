module.exports = (msg, class_name = 'purchase-container') => {
  return `
    <div class="${class_name} saito-overlay-panel saito-overlay-size narrow loader-interstitial-overlay">
      <div class="container-header">${msg}</div> 
      <div class="container-body"><div class="saito-spinner spinner"></div></div>
    </div>
  `;
};
