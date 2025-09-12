module.exports = (app, mod) => {
  let html = `

    <div class="nft-list-container">

      <!-- HEADER -->
      <div class="saito-overlay-form-header">
         <div class="saito-overlay-form-header-title">
            MY NFTs
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
