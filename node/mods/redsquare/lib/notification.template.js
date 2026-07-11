module.exports = (notification) => {
  let items = notification.notifications
    .map((item) => {
      let icon = 'fa-bell';

      if (item.type === 'like') {
        icon = 'fa-heart';
      }
      if (item.type === 'reply') {
        icon = 'fa-comment';
      }
      if (item.type === 'retweet') {
        icon = 'fa-retweet';
      }

      return `
        <li class="notification-item">
          <i class="fa-solid ${icon}"></i>
          <div class="notification-content">
            <span class="notification-user">${item.user}</span>
            <span class="notification-text">${item.text}</span>
            <span class="notification-time">${item.time}</span>
          </div>
        </li>
      `;
    })
    .join('');

  return `
    <section class="notification">
      <header class="notification-header">
        <h2>Notifications</h2>
      </header>
      <ul class="notification-list">
        ${items}
      </ul>
    </section>
  `;
};
