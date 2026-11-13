module.exports = function nftListTemplate() {
  return `
    <div class="redemption-list">
      <h2>My Redemption NFTs</h2>
      <p class="redemption-list-note">Only NFTs of type redemption-nft are shown. A wallet entry is not itself a redeemable claim.</p>
      <div class="redemption-nft-grid"></div>
      <p class="redemption-list-empty" hidden>No redemption NFTs are in this wallet.</p>
    </div>
  `;
};
