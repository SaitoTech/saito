module.exports = function redemptionMainTemplate() {
  return `
    <div class="redemption">
      <section class="redemption-cta saito-cta">
        <h1 class="redemption-title">Redemption</h1>
        <p class="redemption-summary">Redeem eligible NFTs for the assets specified in their signed claims.</p>
        <div class="saito-button-row">
          <button class="saito-button-primary" id="redemption-create" type="button">Create</button>
          <button class="saito-button-secondary" id="redemption-open-nfts" type="button">Redeem</button>
        </div>
      </section>
    </div>
  `;
};
