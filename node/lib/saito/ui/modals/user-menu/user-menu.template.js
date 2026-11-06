module.exports = (app, publicKey) => {
  let imgsrc = app.keychain.returnIdenticon(publicKey);
  let name = app.keychain.returnIdentifierByPublicKey(publicKey, true);
  if (name == publicKey) {
    name = 'Anonymous User';
  }

  return `
   <div class="saito-user-menu" id="saito-user-menu">
     <h2 class="saito-modal-title">
      <div class="saito-user">
        <div class="saito-identicon-box"><img class="saito-identicon" src="${imgsrc}"></div>
        ${name}
        <button type="button" class="saito-userline saito-user-menu-copy" title="Copy address" aria-label="Copy address">
          <span>${publicKey}</span>
          <i class="fa-regular fa-copy" aria-hidden="true"></i>
        </button>
      </div>
     </h2>
     <div class="saito-modal-content saito-menu-select-heavy">
     </div>
   </div>
  
   `;
};
