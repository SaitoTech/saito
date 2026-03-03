module.exports = (app, mod, nft_overlay) => {
  let html = `
    <div class="saito-nft-panel saito-nft-panel-send">
      <div class="saito-nft-panel-body">
        <div>
          <h2 class="saito-nft-mode-title">Send NFT</h2>
          <label class="saito-nft-input-label">Recipient Address</label>
          <input class="saito-nft-input-field" id="nft-receiver-address"/>
        </div>
  `;

  let splitUtxosHtml = '';
  let utxoIdx = 0;
  for (let slip of nft_overlay.nft.returnAllSlips()) {
    utxoIdx++;

    let uuid = 'N/A';
    if (slip.slip1) {
      let blockId = slip.slip1.block_id || 'N/A';
      let txOrdinal = slip.slip1.tx_ordinal || 'N/A';
      let slipIndex = slip.slip1.slip_index !== undefined ? slip.slip1.slip_index : 'N/A';
      uuid = `${blockId}-${txOrdinal}-${slipIndex}`;
    }

    let amount = Number(slip.slip1.amount) || 0;

    splitUtxosHtml += `
        <div class="${utxoIdx == 1 ? 'selected-shard' : ''} nft-slip-box utxo-${utxoIdx}" data-utxo-idx="${utxoIdx}">
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
        </div>
      `;
  }

  html += `
        <div class="nft-slips-container">
          <div class="nft-slips-title">AVAILABLE SHARDS</div>
          <div class="nft-slips-flex">
            ${splitUtxosHtml}
          </div>
        </div>
      </div>
      
      <div class="saito-nft-panel-footer">
        <button class="saito-nft-footer-btn saito-button-secondary saito-nft-cancel-btn">Cancel</button>
        <button class="saito-nft-footer-btn saito-nft-confirm-btn">Confirm</button>
      </div>
    </div>
    `;

  return html;
};
