const NotificationsMainTemplate = require('./main.template');
const NotificationTemplate = require('./notification.template');

class NotificationsMain {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
	}

	render() {
		if (!document.querySelector('.notifications-notifications')) {
			this.app.browser.addElementToSelector(
				NotificationsMainTemplate(this.app, this.mod),
				'.saito-main'
			);
		}

		this.renderNotifications();
	}

	renderNotifications() {
		const container = document.querySelector('.notifications-notifications');
		if (!container) return;

		container.innerHTML = '';

		Object.values(this.mod.notifications).forEach((notification) => {
			let html = NotificationTemplate(this.app, this.mod, notification.tx);

			this.app.browser.addElementToSelector(html, '.notifications-notifications');
		});
	}
}

module.exports = NotificationsMain;

