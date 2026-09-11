function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = ({ profileLinkChecked = false, autoSubmitListings = false } = {}) => {
  const checked = profileLinkChecked ? ' checked' : '';
  const autoSubmitChecked = autoSubmitListings ? ' checked' : '';

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
        <label class="setting">
          <input type="checkbox" data-action="toggle-auto-submit"${autoSubmitChecked} />
          <span>Automatically submit listings to Main Store</span>
        </label>
      </div>
    </div>
  `;
};
