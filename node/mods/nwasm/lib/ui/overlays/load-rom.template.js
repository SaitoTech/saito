module.exports = (opts = {}) => {
  let title = opts.title || 'Loading game…';
  let message = opts.message || 'Downloading and decrypting ROM';

  return `
    <div class="nwasm-load-rom saito-overlay-form">
      <div class="saito-overlay-form-header">
        <h2 class="saito-overlay-form-header-title">${title}</h2>
      </div>
      <div class="body">
        <div class="saito-spinner" aria-hidden="true"></div>
        <div class="status">${message}</div>
      </div>
    </div>
  `;
};
