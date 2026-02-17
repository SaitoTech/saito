let SaitoHeaderTemplate = (app, mod, headerClass) => {
  let identicon = app.keychain.returnIdenticon(mod.publicKey);

  let html = `
   <header id="saito-header" class="${headerClass}">
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
                   <div class="wallet-infoo">
                       <div id="qrcode"></div>
                       <div class="wallet-balance">
                           <img class="wallet-identicon" src="${identicon}">
                           <div class="balance-amount">
                            <span class="balance-amount-whole">0</span>
                            <span class="balance-amount-separator">.</span>
                            <span class="balance-amount-decimal">00</span>
                            </div>
                           <select class="wallet-select-crypto" id="wallet-select-crypto"></select>
                       </div>
                       
                       <div class="pubkey-containter">
                           <div class="profile-public-key generate-keys" id="profile-public-key"><div>generating keys...</div></div>
                           <i class="fas fa-copy"></i>
                       </div>
                       <div class="pubkey-mobile-wrapper">
                           <i id="toggle-qr" class="fa-solid fa-qrcode"></i>
                       </div>
                   </div>
                   <div class="wallet-btn-container">
                       <div class="wallet-btn" id="wallet-btn-withdraw">
                           <i class="fa fa-arrow-up"></i>
                           <span>SEND</span>
                       </div>
                       <div class="wallet-btn" id="wallet-btn-details">
                           <i class="fa-solid fa-wallet"></i>
                           <span>Wallet</span>
                           <i class="hideme fa-solid fa-list"></i>
                           <span class="hideme">Apps</span>
                       </div>
                       <!--div class="wallet-btn" id="wallet-btn-history">
                           <i class="fa-regular fa-clock"></i>
                           <span>History</span>
                       </div-->
                       <div class="wallet-btn" id="wallet-btn-nft">
                           <i class="fa-solid fa-shapes"></i>
                           <span>NFTs</span>
                       </div>
                       <div class="wallet-btn" id="wallet-btn-settings">
                           <i class="fas fa-cog"></i>
                           <span class="option-more">ACCOUNT</span>
                       </div>
                   </div>

               </div>
               <!-------- wallet end ----------->
               <div class="saito-header-menu-section ">
                   <div class="appspace-menu saito-menu empty-menu-section">
                        <ul class="saito-menu-select-heavy"></ul>
                   </div>
                   <hr>
                   <div class="module-menu saito-menu empty-menu-section">
                        <ul class="saito-menu-select-heavy"></ul>
                   </div>
                   <hr>
                   <div class="utilities-menu saito-menu">
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
