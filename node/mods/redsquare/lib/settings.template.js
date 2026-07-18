module.exports = (settings) => {
  return `
    <section class="settings">
      <header class="header">
        <h2 class="title">Settings</h2>
      </header>
      <ul class="list">
        <li class="item">
          <span>Dark mode</span>
          <input type="checkbox" ${settings.dark_mode ? 'checked' : ''} disabled />
        </li>
        <li class="item">
          <span>Notifications</span>
          <input type="checkbox" ${settings.notifications_enabled ? 'checked' : ''} disabled />
        </li>
        <li class="item">
          <span>Curated feed</span>
          <input type="checkbox" ${settings.curated_feed ? 'checked' : ''} disabled />
        </li>
      </ul>
    </section>
  `;
};
