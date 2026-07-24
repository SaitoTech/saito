const NftPickerTemplate = () => {
	return `
    <div class="nft-picker">
      <header>
        <h2>Select an NFT</h2>
        <p>Choose something from your wallet to list on the Store.</p>
      </header>
      <div class="body hide-scrollbar">
        <div class="send-nft-list" data-nft-grid></div>
        <div class="status" data-nft-status></div>
      </div>
      <div class="nft-list-instructions" data-nft-instructions hidden></div>
    </div>
  `;
};

NftPickerTemplate.emptyInstructions = () => {
	return `
    <div class="empty">
      <h3>No NFTs in this wallet.</h3>
    </div>
  `;
};

NftPickerTemplate.createPrompt = () => {
	return `
    <div class="instructions">
      Don't have any NFTs in your wallet? Why not
      <span class="saito-anchor" id="nft-picker-create-link" role="button" tabindex="0">
        <span>create one and list it for sale</span>
      </span>?
    </div>
  `;
};

module.exports = NftPickerTemplate;
