module.exports = (app, mod, nft) => {
  let identicon = app.keychain.returnIdenticon(nft.id);
  let deposit = nft.getDeposit();

  let html = `

  <div class="saito-nft-overlay-container">

    <!-- HEADER -->
    <div class="saito-nft-overlay header">
      <div class="saito-nft-header-left">
        <div class="saito-identicon-box"><img class="saito-identicon" src="${identicon}" data-disable="true" /></div>
        <div class="saito-nft-header-text">
          <div class="saito-nft-header-title">Hex Conquistador – Tile #17</div>
          <div class="saito-nft-header-sub">by xM2v…7jRGs</div>
        </div>
      </div>
      <div class="saito-nft-header-right">
        <div class="saito-nft-header-btn">⋯</div>
      </div>
    </div>

    <div class="saito-nft-overlay panels">
      <div class="saito-nft-panel saito-nft-panel-view active">

        <div class="saito-nft-panel-body">
	  <div class="saito-nft-image" style="background-image: url('${nft?.image || '/saito/img/dreamscape.png'}');"></div>
          <p class="saito-nft-description">
            This is a sample description of an NFT. You can write anything here:
            metadata, instructions, lore, item context, etc.
          </p>
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn enable">Enable</button>
          <button class="saito-nft-footer-btn disable">Disable</button>
          <button class="saito-nft-footer-btn split">Split</button>
          <button class="saito-nft-footer-btn merge">Merge</button>
          <button class="saito-nft-footer-btn send">Send</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-send">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">Send NFT</h2>
          <label class="saito-nft-input-label">Recipient Address</label>
          <input class="saito-nft-input-field" placeholder="xsXq…1aZx" />
          <label class="saito-nft-input-label">Quantity</label>
          <input class="saito-nft-input-field" value="1" />
        </div>
        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-back-btn">Back</button>
          <button class="saito-nft-footer-btn saito-nft-confirm-btn">Confirm</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-split">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">Split NFT</h2>
          <p class="saito-nft-mode-desc">
      		This NFT has multiple units. Drag the slider to determine how many
     		units will remain in the original NFT (left) and how many will form
      		the new NFT (right).
    	  </p>

    	  <div class="saito-nft-split-container">

      	    <input id="saito-nft-split-left" class="saito-nft-split-half saito-nft-split-leftval" type="text" inputmode="numeric" value="1" />
      	    <div class="saito-nft-split-bar">
              <div class="saito-nft-split-grip"></div>
            </div>
            <div id="saito-nft-split-right" class="saito-nft-split-half saito-nft-split-rightval">1</div>

          </div>
        </div>
        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-back-btn">Back</button>
          <button class="saito-nft-footer-btn saito-nft-confirm-btn saito-nft-confirm-split">Confirm</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-merge">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">Send NFT</h2>
          <label class="saito-nft-input-label">Recipient Address</label>
          <input class="saito-nft-input-field" placeholder="xsXq…1aZx" />
          <label class="saito-nft-input-label">Quantity</label>
          <input class="saito-nft-input-field" value="1" />
        </div>
        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn saito-nft-back-btn">Back</button>
          <button class="saito-nft-footer-btn saito-nft-confirm-btn">Confirm</button>
        </div>
      </div>

    </div>

  </div>

`;

  return html;
};
