function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stepClass(n, state = 1) {
  if (state === n) {
    return 'step current';
  }
  if (state > n) {
    return 'step complete';
  }
  return 'step upcoming';
}

function stepButton({ action, label, enabled = false }) {
  if (!action) {
    return '';
  }
  const disabled = enabled ? '' : ' disabled';
  return `<button type="button" class="saito-button-primary" data-action="${action}"${disabled}>${label}</button>`;
}

function storeAddress({ store_url = '' } = {}) {
  const url = escapeHtml(store_url);
  if (!url) {
    return '';
  }

  return `
    <div class="store-address">
      <p class="label">Your store address</p>
      <div class="storefront-url-row">
        <a class="storefront-url" data-storefront-url href="${url}" title="${url}">${url}</a>
        <button type="button" class="saito-icon-button" data-action="copy-url" title="Copy storefront URL" aria-label="Copy storefront URL">
          <i class="fas fa-copy" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  `;
}

module.exports = {
  overlay() {
    return `
    <div class="prepare-store preparing">
      <header>
        <div class="heading">
          <h2 data-prepare-title>Preparing your store</h2>
          <p class="lede" data-prepare-lede hidden>You can now list NFTs and other digital assets for sale or rent.</p>
        </div>
      </header>
      <div class="body">
        <div class="preparing-panel">
          <div class="saito-spinner" aria-hidden="true"></div>
          <p class="status" data-prepare-status>Checking store URL</p>
        </div>
        <div class="ready-panel" hidden></div>
      </div>
    </div>
    `;
  },

  ready({ state = 1, actions = {}, store_url = '' } = {}) {
    return `
      <ol class="steps" data-state="${state}">
        <li class="${stepClass(1, state)}" data-step="1">
          <div class="index" aria-hidden="true">1</div>
          <div class="figure">
            <span class="disc" aria-hidden="true"></span>
            <img src="/store/img/store-wizard-plant-1.png" alt="">
          </div>
          <p class="copy">You'll need SAITO to create and list digital assets.</p>
          ${stepButton({
            action: actions.get_saito && 'get-saito',
            label: 'GET SAITO',
            enabled: !!actions.get_saito && state === 1
          })}
        </li>
        <li class="${stepClass(2, state)}" data-step="2">
          <div class="index" aria-hidden="true">2</div>
          <div class="figure">
            <span class="disc" aria-hidden="true"></span>
            <img src="/store/img/store-wizard-plant-2.png" alt="">
          </div>
          <p class="copy">Create an NFT or upload media to list and sell.</p>
          ${stepButton({
            action: actions.create_nft && 'create-nft',
            label: 'CREATE NFT',
            enabled: !!actions.create_nft && state === 2
          })}
        </li>
        <li class="${stepClass(3, state)}" data-step="3">
          <div class="index" aria-hidden="true">3</div>
          <div class="figure">
            <span class="disc" aria-hidden="true"></span>
            <img src="/store/img/store-wizard-plant-3.png" alt="">
          </div>
          <p class="copy">List your NFT or media on your Store.</p>
          ${stepButton({
            action: actions.list_item && 'list-item',
            label: 'LIST ON STORE',
            enabled: !!actions.list_item && state === 3
          })}
        </li>
      </ol>
      ${storeAddress({ store_url })}
    `;
  }
};
