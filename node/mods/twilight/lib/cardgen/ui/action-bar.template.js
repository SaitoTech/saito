const RESET_ICON = `
  <svg class="ts-reset-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
    <path d="M21 3v6h-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
`;

function actionBar(actions, trailing = '') {
  return `
    <footer class="ts-action-bar">
      <div class="ts-action-bar-main">
        ${actions}
      </div>
      ${trailing}
    </footer>
  `;
}

actionBar.icon = RESET_ICON;

module.exports = actionBar;
