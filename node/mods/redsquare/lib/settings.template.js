module.exports = (settings) => {
  return `
    <section class="settings">
      <header class="settings-header">
        <h2>Settings</h2>
      </header>
      <ul class="settings-list">
        <li class="settings-item">
          <span>Dark mode</span>
          <input type="checkbox" ${settings.dark_mode ? 'checked' : ''} disabled />
        </li>
        <li class="settings-item">
          <span>Notifications</span>
          <input type="checkbox" ${settings.notifications_enabled ? 'checked' : ''} disabled />
        </li>
        <li class="settings-item">
          <span>Curated feed</span>
          <input type="checkbox" ${settings.curated_feed ? 'checked' : ''} disabled />
        </li>
      </ul>
    </section>
  `;
};
