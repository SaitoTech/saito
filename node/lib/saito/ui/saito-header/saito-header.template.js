let SaitoHeaderTemplate = (app, mod, headerClass) => {
  const identicon = app.keychain.returnIdenticon(mod.publicKey);

  let html = `
   <header id="saito-header" class="saito-header ${headerClass}">
        <div class="saito-header-logo-wrapper">
            <img class="saito-header-logo" alt="Logo" src="/saito/img/logo.svg" />
        </div>
       <div class="hamburger-container">
           <div id="header-msg" class="header-msg"></div>
           <div id="saito-header-menu-toggle"><i class="fa-solid fa-bars"></i></div>
           <div class="saito-header-backdrop"></div>
           <div class="saito-header-hamburger-contents">
               <!-------- wallet start --------->
               <div class="saito-header-profile">
                   <div class="wallet-info">
                       <div id="qrcode"></div>
                       <div class="wallet-balance">
                           <img class="wallet-identicon" src="${identicon}" alt="">
                           <div class="balance-amount">
                            <span class="balance-amount-segments">
                              <span class="balance-amount-whole">0</span>
                              <span class="balance-amount-separator">.</span>
                              <span class="balance-amount-decimal">00</span>
                            </span>
                           </div>
                           <select class="saito-form-select wallet-select-crypto" id="wallet-select-crypto" aria-label="Select cryptocurrency"></select>
                       </div>
                       
                       <div class="wallet-address-row">
                           <div class="pubkey-container">
                               <div class="profile-public-key generate-keys" id="profile-public-key"><div class="profile-public-key-text">generating keys...</div></div>
                               <i class="fas fa-copy"></i>
                           </div>
                           <div class="pubkey-mobile-wrapper">
                               <button type="button" class="wallet-mobile-action" id="toggle-qr" aria-label="Show receive QR code" aria-expanded="false" title="Show receive QR code">
                                   <i class="fa-solid fa-qrcode" aria-hidden="true"></i>
                               </button>
                               <button type="button" class="wallet-mobile-action" id="share-address" aria-label="Share wallet address" title="Share wallet address">
                                   <i class="fa-solid fa-share-nodes" aria-hidden="true"></i>
                               </button>
                           </div>
                       </div>
                   </div>
                   <div class="wallet-btn-container">
                       <div class="wallet-btn" id="wallet-btn-withdraw">
                           <div class="saito-icon-button">
                               <i class="fa-solid fa-arrow-up wallet-send-icon"></i>
                           </div>
                           <span>Send</span>
                       </div>
                       <div class="wallet-btn" id="wallet-btn-nft">
                           <div class="saito-icon-button">
                               <i class="fa-solid fa-shapes"></i>
                           </div>
                           <span>NFTs</span>
                       </div>
                       <div class="wallet-btn" id="wallet-btn-switch">
                           <div class="saito-icon-button">
                               <i class="fa-solid fa-wallet"></i>
                           </div>
                           <span>Wallet</span>
                       </div>
                       <div class="wallet-btn" id="wallet-btn-get-saito">
                           <div class="saito-icon-button">
                               <i class="fa-solid fa-plus"></i>
                           </div>
                           <span>Get Saito</span>
                       </div>
                       <div class="wallet-btn" id="wallet-btn-settings">
                           <div class="saito-icon-button">
                               <i class="fas fa-cog"></i>
                           </div>
                           <span>Account</span>
                       </div>
                   </div>

               </div>
               <!-------- wallet end ----------->
               <div class="saito-header-menu-section ">
                   <hr class="wallet-controls-separator">
                   <div class="appspace-menu saito-menu empty-menu-section">
                        <ul class="saito-menu-select-heavy"></ul>
                   </div>
                   <hr>
                   <div class="module-menu saito-menu empty-menu-section">
                        <ul class="saito-menu-select-heavy"></ul>
                   </div>
                   <hr>
                   <div class="utilities-menu saito-menu empty-menu-section">
                        <ul class="saito-menu-select-heavy"></ul>
                   </div>
               </div>
               <div class="header-wallet">
                   <div class="saito-header-wallet-menu saito-menu-select-subtle">
                   </div>
               </div>
           </div>
       </div>
   </header>

  `;
  return html;
};

module.exports = SaitoHeaderTemplate;
//<div>${mod.publicKey.slice(0, -8)}</div><div>${mod.publicKey.slice(-8)}</div>
