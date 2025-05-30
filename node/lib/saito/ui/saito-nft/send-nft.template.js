module.exports = (app, mod) => {

  let html = `
      <div class="container send-nft-container">

         <div class="saito-overlay-form-header nft-title">
           <div class="saito-overlay-form-header-title">
              <div>
                 Send NFT
              </div>
              <div class="nft-link" id="nft-link">
                 <span>create nft</span> 
              </div>
           </div>
        </div>

         <div class="utxo-slips">
            <div class="instructions">
               Select NFT from your wallet to send
            </div>
            <div id="nft-list">
               
            </div>
         </div>
         <div class="right-section">
            <div class="nft-receiver">
               <label for="nfts-receiver">Receiver</label>
               <input type="text" placeholder='Receiver public key' id="nfts-receiver" value="">
            </div>
            <div class="create-button nft-inactive">
               <button id="send_nft">Send NFT</button>
            </div>
         </div>
      </div>
  `;

  return html;

}
