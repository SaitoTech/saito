module.exports = (app, mod) => {
  let html = `
    <style>
      /* Make each row a positioned container so the split‐overlay can sit on top */
      .send-nft-row {
        position: relative;
      }
      /* Optional: ensure the overlay’s text is easy to read */
      .split-overlay div {
        font-size: 1rem;
        font-weight: bold;
      }
    </style>

    <div class="send-nft-container">

      <!-- HEADER -->
      <div class="saito-overlay-form-header nft-title">
         <div class="saito-overlay-form-header-title">
            <div class="saito-overlay-header-nav">
               <div id="send-nft-title">YOUR NFTs</div>
            </div>
            <div class="nft-link" id="nft-link">
               <span>create nft</span>
            </div>
         </div>
      </div>

      <!-- PAGE 1: NFT LIST -->
      <div id="page1" class="nft-page">
        <div class="nft-creator utxo-slips">
          <div class="instructions">
            <span>Select NFT from your wallet to send </span> <br >
            <span id="send-nft-wait-msg">(if you just created NFT or got sent one, wait for network confirmation)</span>
          </div>
          <div id="nft-list">
            <!-- renderNft() in send-nft.js will fill this -->
          </div>
        </div>
      </div>


    </div>
  `;
  return html;
};
