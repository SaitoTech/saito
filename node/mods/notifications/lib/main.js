const NotificationsMainTemplate = require('./main.template');
const NotificationTemplate = require('./notification.template');

/** Hardcoded sample tweets for UI testing. Temporarily bypasses real data. */
const SAMPLE_NOTIFICATIONS = [
  {
    id: 'sample-1',
    username: 'saito_core',
    time: '2m',
    text:
      'Welcome to Notifications.\n\nThis stream highlights activity from across the network with a cleaner timeline view.',
    numReplies: 4,
    numRetweets: 2,
    numLikes: 19
  },
  {
    id: 'sample-2',
    username: 'alice_dev',
    time: '15m',
    text:
      'Shipping update: we cut lobby load time by ~30% this morning.\n\nAnyone testing on mobile, please reply with perf notes.',
    link: 'https://apps.saito.io/arcade',
    numReplies: 5,
    numRetweets: 2,
    numLikes: 23,
    hasChild: true
  },
  {
    id: 'sample-3',
    username: 'bob_network',
    time: '17m',
    text:
      'Replying to @alice_dev\n\nTested on high-latency Wi‑Fi and reconnect behavior is noticeably better. Great improvement.',
    numReplies: 1,
    numRetweets: 0,
    numLikes: 9,
    hasParent: true
  },
  {
    id: 'sample-4',
    username: 'release_notes',
    time: '1h',
    text:
      'Saito Node v3.4.0 is now live.\n\n• faster propagation\n• cleaner wallet prompts\n• stability fixes in message queue',
    media: 'https://picsum.photos/600/300',
    numReplies: 12,
    numRetweets: 7,
    numLikes: 54
  },
  {
    id: 'sample-5',
    username: 'carol_ops',
    time: '5h',
    text:
      'Maintenance reminder:\nValidator restart window is 02:00–02:15 UTC.\n\nNo user action required unless you are running custom peers.',
    numReplies: 0,
    numRetweets: 4,
    numLikes: 31
  },
  {
    id: 'sample-6',
    username: 'validator_news',
    time: 'Yesterday',
    text:
      'Public testnet reached a new daily throughput peak while keeping finality stable.\n\nDashboard details in the thread.',
    link: 'https://status.saito.io',
    numReplies: 2,
    numRetweets: 3,
    numLikes: 18
  }
];

class NotificationsMain {
	constructor(app, mod, container = '.saito-container') {
		this.app = app;
		this.mod = mod;
		this.container = container;
	}

	render() {
		if (!document.querySelector('.notifications-notifications')) {
			this.app.browser.addElementToSelector(
				NotificationsMainTemplate(this.app, this.mod),
				this.container
			);
		}

		this.renderNotifications();
	}

	renderNotifications() {
		const container = document.querySelector('.notifications-notifications');
		if (!container) return;

		container.innerHTML = '';

		// UI testing: render hardcoded samples; otherwise render real notifications
		const items = Object.keys(this.mod.notifications || {}).length > 0
			? Object.values(this.mod.notifications).map((n) => ({
					id: n.tx?.signature ?? '',
					username: n.tx?.from?.[0]?.publicKey
						? (this.app?.browser?.returnAddressHTML?.(n.tx.from[0].publicKey) ?? n.tx.from[0].publicKey)
						: 'User',
					time: '',
					text: 'Notification',
			  }))
			: SAMPLE_NOTIFICATIONS;

		items.forEach((data) => {
			const html = NotificationTemplate(this.app, this.mod, data);
			this.app.browser.addElementToSelector(html, '.notifications-notifications');
		});
	}
}

module.exports = NotificationsMain;
