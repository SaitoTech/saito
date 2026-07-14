module.exports = (newPost) => {
  // Injected into `.manager-header-actions` — compact feed-header control.
  return `
      <button class="new-post-button saito-button-primary" type="button">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        <span>New Post</span>
      </button>
  `;
};
