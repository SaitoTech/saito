module.exports = () => {
  return `
    <div class="feed-status" data-status="content">
      <div class="loader" aria-hidden="true">
        <div class="saito-loader"></div>
      </div>
      <p class="message"></p>
      <a href="#" class="check-again saito-text-link" hidden>Check again.</a>
      <button type="button" class="retry saito-button-primary" hidden>Retry</button>
    </div>
  `;
};
