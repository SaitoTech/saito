module.exports = (app, mod, data = {}) => {
  const inactive = !!data.inactive;

  return `
  <div class="faucet-main">
    <div class="faucet-home">
      <button type="button" class="saito-button-primary"${inactive ? ' hidden' : ''}>
        Get tokens from the faucet
      </button>
      <p class="inactive-message"${inactive ? '' : ' hidden'}>
        I'm sorry, the faucet's not active at this point.
      </p>
    </div>
  </div>`;
};
