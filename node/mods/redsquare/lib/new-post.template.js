module.exports = (newPost) => {
  // Injected into `.sidebar-right > .new-post` — not part of the Profile card.
  return `
      <button class="new-post-button saito-button-primary" type="button">
        New Post
      </button>
  `;
};
