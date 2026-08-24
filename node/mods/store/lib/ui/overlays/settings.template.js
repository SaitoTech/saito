function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({ profileLinkChecked = false } = {}) => {
  const checked = profileLinkChecked ? ' checked' : '';

  return `
    <div class="store-settings">
      <header>
        <h2>Settings</h2>
      </header>
      <div class="body">
        <label class="setting">
          <input type="checkbox" data-action="toggle-profile-link"${checked} />
          <span>Add Store Link to RedSquare Profile</span>
        </label>
      </div>
    </div>
  `;
};
