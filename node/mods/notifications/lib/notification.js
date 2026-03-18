const NotificationTemplate = require('./notification.template');

class Notification {
	constructor(app, mod, tx) {
		this.app = app;
		this.mod = mod;
		this.tx = tx;
	}

	render() {
		return NotificationTemplate(this.app, this.mod, this.tx);
	}

	attachEvents() {}
}

module.exports = Notification;

