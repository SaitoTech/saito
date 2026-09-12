const NFT_LIST_TYPE_OPTIONS = [
  { value: '', label: 'ALL NFTs' },
  { value: 'image', label: 'IMAGE NFTs' },
  { value: 'css', label: 'CSS THEMES' },
  { value: 'js', label: 'EXTENSIONS' },
  { value: 'vault-nft-key', label: 'ACCESS KEYS' }
];

module.exports = (ui) => {
  const selected = ui?.type || '';
  const selected_label =
    NFT_LIST_TYPE_OPTIONS.find((opt) => opt.value === selected)?.label || 'ALL NFTs';

  const options = NFT_LIST_TYPE_OPTIONS.map((opt) => {
    const is_selected = opt.value === selected;
    return `<li class="nft-list-type-option" role="option" data-value="${opt.value}" aria-selected="${is_selected ? 'true' : 'false'}">${opt.label}</li>`;
  }).join('');

  return `
    <div class="saito-nft-list">

      <header class="saito-overlay-form-header">
         <button type="button" id="create-nft" class="create-nft-btn saito-button-square" aria-label="Create NFT"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
         <div class="nft-list-type" id="nft-list-type">
           <button type="button" class="nft-list-type-button" aria-label="NFT type" aria-haspopup="listbox" aria-expanded="false">
             <span class="nft-list-type-label">${selected_label}</span>
             <span class="nft-list-type-caret" aria-hidden="true"></span>
           </button>
           <ul class="nft-list-type-menu" role="listbox" hidden>
             ${options}
           </ul>
         </div>
      </header>

      <div class="nft-list" id="nft-list">
        <!-- renderNft() will fill this -->
      </div>

      <div id="nft-list-instructions" class="nft-list-instructions"></div>

    </div>
  `;
};
