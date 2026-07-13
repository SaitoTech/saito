module.exports = (menu) => {
  const items = menu.actions
    .map(
      (action) => `
    <div class="tweet-menu-item" role="menuitem" tabindex="0" data-action="${action.id}">
      <span class="tweet-menu-icon" aria-hidden="true">
        <i class="fa-solid ${action.icon}"></i>
      </span>
      <span class="tweet-menu-label">${action.label}</span>
    </div>
  `
    )
    .join('');

  return `
    <nav class="tweet-menu saito-menu-select-subtle" role="menu" aria-label="Tweet options">
      ${items}
    </nav>
  `;
};
