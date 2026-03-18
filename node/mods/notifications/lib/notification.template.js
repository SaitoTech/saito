module.exports = (app, mod, tx) => {
	const sig = tx?.signature || '';
	const sender = tx?.from?.[0]?.publicKey || '';

	const addressHtml = app?.browser?.returnAddressHTML(sender) || sender || '';

	return `
    <div class="notifications-notification" data-id="${sig}">
      <div class="notifications-notification-avatar"></div>
      <div class="notifications-notification-body">
        <div class="notifications-notification-text">${addressHtml}</div>
        <div class="notifications-notification-time"></div>
      </div>
    </div>
  `;
};

