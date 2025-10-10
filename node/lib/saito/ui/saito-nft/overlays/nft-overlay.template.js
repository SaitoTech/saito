module.exports = (app, mod, nft) => {
  let identicon = app.keychain.returnIdenticon(nft.id);
  let price = nft.getBuyPriceSaito();

  let html = `

    <div class="nft-details-container">

      <!-- DETAILS -->
      <div class="nft-details-header">
        <div class="nft-details-id-cont">
          <div class="nft-details-identicon">
            <img class="nft-identicon" src="${identicon}">
          </div>
          <div class="nft-details-id">${nft.id}</div>
        </div>

        <div class="nft-details-section">
          <div class="nft-details-section-title">DEPOSIT</div>
          <div class="nft-details-section-content">
            <div class="nft-details-value">${app.browser.formatDecimals(price, true)}</div>
            <div class="nft-details-ticker">SAITO</div>
          </div>
        </div>

        <div class="nft-details-section left-justify">
          <div class="nft-details-section-title">OWNER</div>
          <div class="nft-details-section-content">
            <div class="nft-details-value">${nft.seller || nft.slip1.public_key}</div>
          </div>
        </div>

        <div class="nft-details-section">
          <div class="nft-details-section-title">QUANTITY</div>
          <div class="nft-details-section-content">
            <div class="nft-details-value">${nft.amount}</div>
          </div>
        </div>

      </div>

      <!-- CONTENTS --> 
      <div class="nft-details-data">
        <div class="nft-card-img" style="background-image: url('${nft?.image || '/saito/img/dreamscape.png'}');">
          ${nft.text ? `<div class="nft-card-text">${nft.text}</div>` : ''}
        </div>
      </div>

      <!-- ACTIONS --> 
      <div class="nft-details-actions" data-show="none">
        <!-- SEND -->
        <div class="nft-details-action" id="nft-details-send">
          <div class="nft-receiver">
            <input type="text" placeholder="Recipient public key" id="nft-receiver-address" value="" />
          </div>
          <div class="saito-button-row auto-fit">
            <button id="cancel" class='saito-button-secondary cancel-action'>Cancel</button>  
            <button id="confirm_send" class="saito-button-primary disabled">Send</button>
          </div>
        </div>
        
        <!-- SPLIT -->
        <div class="nft-details-action" id="nft-details-split">
          <div class="nft-details-section-header">
            <p>Turn one NFT with many units into smaller NFTs. This lets you keep some units and send or trade others.”</p>
            <div id="nft-details-split-bar"></div>
            <div class="saito-button-row auto-fit">
              <button id="cancel" class='saito-button-secondary cancel-action'>Cancel</button>  
              <button id="send-nft-confirm-split" class="saito-button-primary">Confirm Split</button>
            </div>
          </div>
        </div>
        
        <!-- MERGE -->
        <div class="nft-details-action" id="nft-details-merge">
          <div class="nft-details-section-header">
            <p>Combine multiple NFTs of the same type back into a single larger NFT, making them easier to manage.</p>
            <div class="saito-button-row auto-fit">
              <button id="cancel" class='saito-button-secondary cancel-action'>Cancel</button>  
              <button id="send-nft-merge" class="saito-button-primary">Confirm Merge</button>
            </div>
          </div>
        </div>
      </div>

      <div id="action-buttons" class="saito-button-row auto-fit">
        <button id="merge" class="saito-button-secondary">Merge</button>
        <button id="split" class="saito-button-secondary">Split</button>
        <button id="send" class="saito-button-primary">Send</button>
      </div>
    </div>
`;

  return html;
};
