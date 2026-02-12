module.exports = (utxoIdx, initial_amount) => {

  return `
    <div class="saito-nft-split-overlay split-container-utxo-${utxoIdx} split-overlay-active"
         data-utxo-idx="${utxoIdx}">

      <div class="split-instructions">
        Your browser is currently atomizing this NFT into 1-unit chunks.
        If you close this tab or your browser the process will stop.
        Please wait while we process your instructions on the network...
      </div>

      <div class="split-slider-wrapper">

        <div class="split-number-box">
          <i class="fa-solid fa-spinner fa-spin"></i>
        </div>

        <div class="fancy-slider-bar" style="display:flex; align-items:center; justify-content:center;">
          <div class="split-half" style="width:100%; text-align:center;">
            <div class="nft-atomize-progress">
              0 / ${initial_amount}
            </div>
          </div>
        </div>

        <div class="split-number-box">
          ${initial_amount}
        </div>

      </div>

      <div class="nft-atomize-status" style="font-size:0.85em; opacity:0.8; margin-top:4px; text-align:center;">
        Preparing transactions...
      </div>

    </div>
  `;
};

