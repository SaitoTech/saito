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
    </div>
  `;
};

NftPickerTemplate.emptyInstructions = () => {
	return `
    <div class="empty">
      <h3>No NFTs in this wallet</h3>
      <p>Create or receive an NFT first, then come back to list it.</p>
    </div>
  `;
};

module.exports = NftPickerTemplate;
