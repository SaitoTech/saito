const ModTemplate = require('../../lib/templates/modtemplate');
const index = require('./web/index');

class Notifications extends ModTemplate {
	constructor(app) {
		super(app);

console.log("TESTING!");

		this.app = app;
		this.appname = 'Notifications';
		this.name = 'Notifications';
		this.slug = 'notifications';
		this.description = 'Notification scaffold (transactions -> UI components).';

		this.notifications = {};

		this.ui = null;
	}

	async render() {
		if (!this.app.BROWSER || !this.browser_active) return;

		if (!this.ui) {
			const NotificationsMain = require('./lib/main');
			this.ui = new NotificationsMain(this.app, this);
		}

		this.ui.render();
	}

	addNotification(tx) {
		if (!tx?.signature) return false;

		// ignore if we don't know who "we" are yet
		if (!this.publicKey) return false;

		// Ignore transactions sent by the user
		if (typeof tx.isFrom === 'function' && tx.isFrom(this.publicKey)) return false;

		// Only process transactions addressed to the user
		if (typeof tx.isTo === 'function' && !tx.isTo(this.publicKey)) return false;

		// Deduplicate by signature
		if (this.notifications[tx.signature]) return false;

		this.notifications[tx.signature] = {
			tx,
			status: 'unread',
			received_at: Date.now()
		};

		return true;
	}

	resetNotifications() {
		for (const sig in this.notifications) {
			this.notifications[sig].status = 'read';
		}
	}

	returnNotifications() {
		return Object.values(this.notifications).sort(
			(a, b) => b.received_at - a.received_at
		);
	}

	onConfirmation(blk, tx, conf) {
		if (conf === 0 && this.app?.BROWSER) {
			this.addNotification(tx);
		}
	}

	webServer(app, expressapp, express, alternative_slug = null) {
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const notifications_self = this;

		expressapp.use(uri, express.static(webdir));

		expressapp.get(uri, async function (req, res) {
			let html = index(app, notifications_self, app.build_number);
			res.setHeader('Content-type', 'text/html');
			res.charset = 'UTF-8';
			return res.send(html);
		});
	}
}

module.exports = Notifications;

