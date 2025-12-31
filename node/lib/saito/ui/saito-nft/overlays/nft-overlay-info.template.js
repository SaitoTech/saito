module.exports = (app, mod, nft_overlay) => {
  let can_merge = nft_overlay.can_merge;
  let can_split = nft_overlay.can_split;
  let all_slips = nft_overlay.all_slips || [];
  let nft = nft_overlay.nft;

  // Extract NFT information
  let nft_id = nft?.id || 'N/A';
  let creator = nft?.creator || nft?.slip1?.public_key || 'N/A';
  
  // Decode creation block info from slip3
  let creationInfo = nft_overlay.decodeSlip3CreationInfo();
  let block_id = creationInfo.block_id || 'N/A';
  let tx_ordinal = creationInfo.tx_ordinal || 'N/A';
  let block_display = block_id !== 'N/A' ? `${block_id}-${tx_ordinal}` : 'N/A';

  // Extract metadata
  let metadata = nft_overlay.extractMetadata();
  let metadataHtml = '';
  if (Object.keys(metadata).length > 0) {
    metadataHtml = '<div class="nft-info-metadata">';
    for (let key in metadata) {
      let value = metadata[key];
      if (typeof value === 'object') {
        value = JSON.stringify(value, null, 2);
      }
      metadataHtml += `
        <div class="nft-info-metadata-item">
          <span class="nft-info-metadata-key">${key}:</span>
          <span class="nft-info-metadata-value">${String(value)}</span>
        </div>
      `;
    }
    metadataHtml += '</div>';
  } else {
    metadataHtml = '<div class="nft-info-metadata-empty">No additional metadata</div>';
  }

  // Build info table HTML
  let createdInDisplay = block_id !== 'N/A' && tx_ordinal !== 'N/A' 
    ? `block ${block_id}, transaction ${tx_ordinal}` 
    : 'N/A';
  
  let metadataRow = '';
  if (Object.keys(metadata).length > 0) {
    metadataRow = `
      <div class="nft-info-row nft-info-row-metadata">
        <div class="nft-info-label">metadata:</div>
        <div class="nft-info-value">${metadataHtml}</div>
      </div>
    `;
  }
  
  let infoTableHtml = `
    <div class="nft-info-table">
      <div class="nft-info-row">
        <div class="nft-info-label">NFT ID:</div>
        <div class="nft-info-value">${nft_id}</div>
      </div>
      <div class="nft-info-row">
        <div class="nft-info-label">created by:</div>
        <div class="nft-info-value">${creator}</div>
      </div>
      <div class="nft-info-row">
        <div class="nft-info-label">created in:</div>
        <div class="nft-info-value">${createdInDisplay}</div>
      </div>
      ${metadataRow}
    </div>
  `;

  let mergeButtonHtml = '';
  if (can_merge) {
    mergeButtonHtml = `<button class="saito-nft-footer-btn merge">Merge</button>`;
  }

  let splitUtxosHtml = '';
  let splitSlidersHtml = '';
  // Generate slip boxes for all slips, not just when can_split
  if (all_slips.length > 0) {
    for (let z = 0; z < all_slips.length; z++) {
      let utxoIdx = z + 1;
      let slip = all_slips[z];
      
      // Get UUID from slip1: block_id-transaction_id-slip_id
      let uuid = 'N/A';
      if (slip.slip1) {
        let blockId = slip.slip1.block_id || 'N/A';
        let txOrdinal = slip.slip1.tx_ordinal || 'N/A';
        let slipIndex = slip.slip1.slip_index || 'N/A';
        uuid = `${blockId}-${txOrdinal}-${slipIndex}`;
      }
      
      let amount = Number(slip.slip1.amount) || 0;
      let splitButtonHtml = '';
      if (amount > 1) {
        splitButtonHtml = `<div class="utxo-split-btn" data-utxo-idx="${utxoIdx}">[ split ]</div>`;
      }
      
      splitUtxosHtml += `
        <div class="nft-slip-box utxo-${utxoIdx}" id="utxo_${utxoIdx}">
          <div class="nft-slip-box-row">
            <div class="nft-slip-box-label">UUID:</div>
            <div class="nft-slip-box-value">${uuid}</div>
          </div>
          <div class="nft-slip-box-row">
            <div class="nft-slip-box-label">amount:</div>
            <div class="nft-slip-box-value">${slip.slip1.amount}</div>
          </div>
          <div class="nft-slip-box-row">
            <div class="nft-slip-box-label">deposit:</div>
            <div class="nft-slip-box-value">${slip.slip2.amount}</div>
          </div>
          <div class="nft-slip-box-actions">
            <div class="utxo-deposit-btn" data-utxo-idx="${utxoIdx}">[ deposit ]</div>
            ${splitButtonHtml}
          </div>
        </div>
      `;
      
      // Create a hidden slider for each UTXO
      let canAtomize = all_slips[z].slip1.amount <= 25;
      let atomizeButtonHtml = '';
      if (canAtomize) {
        atomizeButtonHtml = `<button class="split-button atomize-button atomize-button-utxo-${utxoIdx}">atomize</button>`;
      }
      
      splitSlidersHtml += `
        <div class="saito-nft-split-overlay split-container-utxo-${utxoIdx}" data-utxo-idx="${utxoIdx}">
          <div class="split-instructions">
            Adjust this slider to manually split your NFT into two parts. When you are happy with the new allocation, click the "split" button to make the transaction that divides it.${canAtomize ? ' If your unit has less than 25 items, you can also "atomize" it -- dividing it up into single units that cannot be further divided.' : ''}
          </div>
          <div class="split-slider-wrapper">
            <div class="split-number-box split-number-left-utxo-${utxoIdx}" id="split-number-left-utxo-${utxoIdx}">0</div>
            <div class="fancy-slider-bar" id="split-slider-utxo-${utxoIdx}">
              <div class="split-half split-left-utxo-${utxoIdx}" id="split-left-utxo-${utxoIdx}"></div>
              <div class="split-bar split-bar-utxo-${utxoIdx}" id="split-bar-utxo-${utxoIdx}"></div>
              <div class="split-half split-right-utxo-${utxoIdx}" id="split-right-utxo-${utxoIdx}"></div>
            </div>
            <div class="split-number-box split-number-right-utxo-${utxoIdx}" id="split-number-right-utxo-${utxoIdx}">0</div>
          </div>
          <div class="split-buttons-container">
            <button class="split-button split-return-button split-return-button-utxo-${utxoIdx}">Cancel</button>
            <div class="split-buttons-right">
              ${atomizeButtonHtml}
              <button class="split-button split-button-utxo-${utxoIdx}">split</button>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Build slips flex container HTML - show if there are any slips
  let slipsContainerHtml = '';
  if (all_slips.length > 0) {
    slipsContainerHtml = `
      <div class="nft-slips-container">
        <div class="nft-slips-title">NFT UTXO / SLIPS</div>
        <div class="nft-slips-flex">
          ${splitUtxosHtml}
        </div>
      </div>
    `;
  }

  return `
    <div class="saito-nft-panel saito-nft-panel-info">
      <div class="saito-nft-panel-body">
        ${infoTableHtml}
        ${slipsContainerHtml}
        ${mergeButtonHtml ? `<div class="nft-merge-button-container">${mergeButtonHtml}</div>` : ''}
        ${splitSlidersHtml}
      </div>
      <div class="saito-nft-split-utxo"></div>
      <div class="saito-nft-panel-footer">
        <button class="saito-nft-footer-btn saito-nft-delete-btn">Delete</button>
      </div>
    </div>
  `;
};
