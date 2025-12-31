module.exports = (app, mod, nfttx, nft) => {
  let identicon = app.keychain.returnIdenticon(nft.id);
  let defaultTitle = 'Click to provide title (optional)';
  let defaultDescription = 'Click to provide description (optional)';

  // Get text content for display
  let text = '';
  if (nft.text) {
    text = nft.text;
  } else if (nft.css) {
    text = nft.css;
  } else if (nft.json) {
    text = nft.json;
  } else if (nft.js) {
    text = nft.js;
  }

  let html = `

  <div class="saito-nft-overlay-container">

    <div class="saito-nft-overlay header">
      <div class="saito-nft-header-left">
        <div class="saito-identicon-box">
          <img class="saito-identicon" src="${identicon}" data-disable="true" />
        </div>
        <div class="saito-nft-header-text">
          <div class="saito-nft-header-title-wrapper-metadata">
            <div class="saito-nft-header-title editable" data-default-title="${defaultTitle}">${nft.title || defaultTitle}</div>
            <i class="fa-solid fa-pencil saito-nft-edit-title-icon-metadata"></i>
          </div>
          <div class="saito-nft-header-sub">by ${nft.creator}</div>
        </div>
      </div>

      <div class="saito-nft-header-right">
      </div>
    </div>

    <div class="saito-nft-overlay panels">
      <div class="saito-nft-panel saito-nft-panel-view active .create-nft-container">
        <div class="saito-nft-panel-body nft-creator">
          <div class="nft-creator-content-wrapper">
  `;
  
  // Create image/textbox display (full-size like nft-overlay)
  if (nft.image) {
    html += `
      <div class="saito-nft-image" style="background-image:url('${nft.image}')">
        ${text ? `<div class="saito-nft-text">${text}</div>` : ''}
      </div>
    `;
  } else if (text) {
    html += `
      <div class="saito-nft-image" style="background-image:url('/saito/img/dreamscape.png')">
        <div class="saito-nft-text">${text}</div>
                </div>
	    `;
  } else {
    html += `
              <div class="textarea-container">
                <div class="saito-app-upload active-tab paste_event" id="nft-image-upload">
                  drag-and-drop to add image to NFT (optional)
                </div>
                <textarea class="create-nft-textarea" id="create-nft-textarea"></textarea>
              </div>
	    `;
  }

  // Description box OVER the image/textbox
  let descriptionText = nft.description || defaultDescription;
  html += `
            <div class="saito-nft-description-box-metadata editable" data-default-description="${defaultDescription}">
              <div class="saito-nft-description-text-metadata">${descriptionText}</div>
              <i class="fa-solid fa-pencil saito-nft-edit-description-icon-metadata"></i>
            </div>
          </div>
        </div>

        <div class="saito-nft-panel-footer">
          <button class="saito-nft-footer-btn send">Confirm</button>
        </div>
      </div>

      <div class="saito-nft-panel saito-nft-panel-info">
        <div class="saito-nft-panel-body">
          <h2 class="saito-nft-mode-title">NFT Information</h2>
        </div>
      </div>

    </div>
  </div>
  `;

  return html;
};

