module.exports = (app, mod) => {
  let html = `
    <div class="container send-nft-container">

      <!-- HEADER -->
      <div class="saito-overlay-form-header nft-title">
        
         <div class="saito-overlay-form-header-title">
            <div class="saito-overlay-header-nav">
               <div class="page-navigation page2">
                  <div id="nft-back">← back</div>
               </div>
               <div id="send-nft-title">Select NFT</div>
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
            Select NFT from your wallet to send
          </div>
          <div id="nft-list">
            <!-- renderNft() in send-nft.js will fill this -->
          </div>
        </div>
      </div>

      <div class="page-navigation page1">
         <!-- Merge and Divide buttons are hidden by default -->
         <button id="send-nft-merge" style="display: none;">Merge</button>
         <button id="send-nft-split" style="display: none;">Split</button>
         <button id="nft-next" class="nft-next disabled">Add Receipient</button>
      </div>

      <!-- PAGE 2: RECEIVER + SEND -->
      <div id="page2" class="nft-page" style="display: none;">

        <div class="nft-receiver">
          <label for="nfts-receiver">Receiver</label>
          <input
            type="text"
            placeholder="Receiver public key"
            id="nfts-receiver"
            value=""
          />
        </div>
        
        <div class="create-button">
          <button id="send_nft">Send</button>
        </div>
      </div>

    </div>
  `;
  return html;
};
