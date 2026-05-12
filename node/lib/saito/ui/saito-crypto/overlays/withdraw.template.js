module.exports = (app, mod, publickey = '', address = '') => {
  let identicon = null;

  if (publickey && app.crypto.isPublicKey(publickey)) {
    identicon = app.keychain.returnIdenticon(publickey);
  }

  let html = `
  
  <form class="saito-overlay-form" id="withdrawal-form" action="/" method="POST">

        <div class="saito-overlay-form-header">
           <div class="saito-overlay-form-header-title">
              <div>
                 Send Token
              </div>
           </div>
        </div>
        <div id="withdraw-step-one">
          <div class="dropdown-cont">
            <div class="saito-overlay-form-input">
                <div class="token-dropdown">
                  <div class="withdraw-token-custom" id="withdraw-token-custom">
                    <button type="button" class="withdraw-token-trigger" id="withdraw-token-trigger" aria-haspopup="listbox" aria-expanded="false">
                      <div class="withdraw-token-trigger-left">
                        <div id="withdraw-logo-cont" class="withdraw-logo-cont"></div>
                        <span id="withdraw-token-trigger-ticker"></span>
                      </div>
                      <div class="withdraw-token-trigger-caret" aria-hidden="true">▾</div>
                    </button>
                    <ul id="withdraw-token-menu" class="withdraw-token-menu hide-element" role="listbox"></ul>
                    <select class="withdraw-select-crypto hide-element" id="withdraw-select-crypto" aria-hidden="true" tabindex="-1"></select>
                  </div>
                </div>
            </div>

            <div class="withdraw-info-cont">
              <span class="withdraw-info-title">balance</span> 
              <div class="withdraw-info-value balance">--</div>
            </div>


            <div class="withdraw-info-cont">
              <span class="withdraw-info-title">network fee</span> 
              <div class="withdraw-info-value fee">--</div>
            </div>
          </div>

          <div class="input-elements-container">
            <div class="saito-overlay-form-input">
              <div class="withdraw-input-cont ${identicon ? 'fixed-user' : ''}" id="withdraw-address-cont">`;

  if (identicon != null) {
    html += `   <div class="withdraw-identicon-container"><img class="saito-identicon" src="${identicon}"></div>`;
  }
  html += `
                <input type="text" autocomplete="off" class="withdraw_address" ${publickey ? 'disabled' : ''} value="${address}" id="withdraw-input-address" required="" placeholder="receiving address">
                <div class="withdraw-options-cont" id="address-book">
                  <i class="fa-solid fa-users"></i>
                </div>
                <div class="withdraw-error" id="withdraw-address-error"></div>
              </div>
            </div>`;

  html += `<div class="saito-overlay-form-input">
              <div class="withdraw-input-cont" id="withdraw-amount-cont">
                <input type="number" autocomplete="off" min="0" max="9999999999.99999999" step="0.00000001" class="withdraw-input-amount" id="withdraw-input-amount" value="" required="" placeholder="amount to send">
                <div class="withdraw-options-cont" id="withdraw-max-btn">
                  <span>MAX</span>
                </div>
                <div class="withdraw-error" id="withdraw-amount-error"></div>
              </div>
            </div>  
          </div>


          <div class="saito-button-row form-submit-container">
            <button type="submit" class="withdraw-submit saito-button-primary saito-overlay-form-submit" id="saito-overlay-submit">Send</button>
          </div>

        </div>


        <div id="withdraw-step-two" class="hide-element">
          <div class="confirm-msg-container">
            <i class="withdraw-msg-icon fa-solid fa-circle-exclamation"></i>
            <div class="saito_spinner spinner"></div>
            <div class="confirm-msg">
              <div>
                <span class="withdraw-msg-text">Send</span> 
                <span class="withdraw-confirm-amount">0 SAITO</span>
                to address 
              </div>
              <div class="withdraw-confirm-address">
                <div class="withdraw-address withdraw-address-1"></div>
                <div class="withdraw-address withdraw-address-2"></div>
                <div class="withdraw-msg-question">?</div>
              </div>
              <div class="withdraw-confirm-fee">(fee: 0 SAITO)</div>
            </div>
          </div>

          <div class="saito-button-row confirm-submit">
            <button type="submit" class="saito-button-secondary" id="withdraw-cancel">Cancel</button> 
            <button type="submit" class="saito-button-primary" id="withdraw-confirm">Confirm</button>
          </div>
        </div>


  </form>

  `;

  return html;
};
