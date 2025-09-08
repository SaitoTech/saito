module.exports = (app, mod, nft) => {
  const identicon = app.keychain.returnIdenticon(nft.id);
  const depositSaito = nft.getDepositInSaito(nft.deposit);
  let owner = app.keychain.returnUsername(nft.slip1.public_key);

  console.log('owner:', owner);
  let html = `

    <div class="nft-details-container">

     
      <div class="nft-details-data" nft-index="${nft.idx}">

        <input
          type="radio"
          name="hidden-nft-radio"
          class="hidden-nft-radio"
          value="${nft.idx}"
          style="display: none;"
        />

        <div class="nft-card-img ${nft.text != '' ? `text` : ``}" style="background-image: url('${nft.image || '/saito/img/dreamscape.png'}');">

   `;

  if (nft.text != '') {
    html += `<div class="nft-card-text">${nft.text}</div>`;
  }

  html += ` 

        </div>
      </div>


      <div class="nft-details-info">
    
        <!-- DETAILS -->
        <div class="nft-details-header">

            <div class="nft-details-id-cont">
              <div class="nft-details-identicon">
              <img class="nft-identicon" src="${identicon}">
              </div>
              <div class="nft-details-id">${nft.id}</div>
            </div>

            <div class="nft-details-row">
              <div class="nft-details-section">
                <div class="nft-details-section-title">OWNER</div>
                <div class="nft-details-section-content nft-details-owner">
                  <div class="nft-details-value">
                    ${owner}
                  </div>
                </div>
              </div>

              <div class="nft-details-section">
                <div class="nft-details-section-title">AMOUNT</div>
                <div class="nft-details-section-content nft-details-owner">
                  <div class="nft-details-value">
                    ${nft.amount}
                  </div>
                </div>
              </div>
            </div>

            <div class="nft-details-section">
              <div class="nft-details-section-title">DEPOSIT</div>
              <div class="nft-details-section-content nft-details-worth">
                <div class="nft-details-value">${app.browser.formatDecimals(depositSaito, true)}</div>
                <div class="nft-details-ticker">SAITO</div>
              </div>
            </div>

        </div>

        <div class="nft-details-actions">

          <!-- SEND -->
           <div class="nft-details-send">
              <h4>SEND <i>✈️</i></h2>
              <div class="nft-receiver">
                <input
                  type="text"
                  placeholder="Receiver public key"
                  id="nft-receiver-address"
                  value=""
                />
              </div>
              
              <div class="saito-button-row">
                <button id="send_nft" class="saito-button-primary disabled">Send</button>
              </div>
           </div>
        </div>

        <div class="nft-details-actions nft-merge-split" id="nft-merge-split">
          <!-- SPLIT -->
           <div class="nft-details-split" id="nft-details-split">
              <div class="nft-details-section-header">
                <h4>SPLIT <i>🪓</i></h2>
                <p>Turn one NFT with many units into smaller NFTs. This lets you keep some units and send or trade others.”</p>
                <div id="nft-details-split-bar"></div>
                <div class="saito-button-row">
                  <button id="send-nft-cancel-split" class="saito-button-primary" style="display: none;">Cancel</button>
                  <button id="send-nft-confirm-split" class="saito-button-primary" style="display: none;">Confirm Split</button>
                  <button id="send-nft-split" class="saito-button-primary disabled">Split</button>
                </div>
              </div>
           </div>
          <!-- MERGE -->
          <div class="nft-details-merge" id="nft-details-merge">
              <div class="nft-details-section-header">
                <h4>MERGE <i>🔗</i></h2>
                <p>Combine multiple NFTs of the same type back into a single larger NFT, making them easier to manage.</p>
                <div class="saito-button-row">
                  <button id="send-nft-merge" class="saito-button-primary disabled">Merge</button>
                </div>
              </div>
          </div>
        </div>

      </div>


    </div>
  `;

  return html;
};
