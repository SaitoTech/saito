const NotificationsMainTemplate = require('./main.template');
const NotificationTemplate = require('./notification.template');

/** Demo tweets: exact state sequence for timeline/thread/connector testing.
 *  Tweet 1: is-parent-focus | Tweet 2: has-parent (no connector 1→2)
 *  Tweet 3: has-child | Tweet 4: has-parent (connector between 3→4) | Tweet 5: none
 */
const SAMPLE_NOTIFICATIONS = [
  {
    id: 'sample-1',
    username: 'saito_core',
    time: '2m',
    text:
      'Longtime users are frustrated with X because it no longer works the way it used to.\n\n' +
      'Back in the early days of Twitter, your reach was simple and direct. If you had 5,000 or 20,000 followers, your posts were delivered to them in real time. It was a true chronological feed — your tweets showed up in the order you posted them, and your audience actually saw your content.\n\n' +
      'The “old” Twitter (pre-2016) was built around that real-time experience. Your voice reached the people who chose to follow you, without interference.\n\n' +
      'Today, that’s no longer the case. X relies on an algorithm-driven, engagement-based feed, meaning even your own followers may never see your posts unless the system decides to prioritize them.',
    numReplies: 1,
    numRetweets: 0,
    numLikes: 5,
    isParentFocus: true
  },
  {
    id: 'sample-2',
    username: 'alice_dev',
    time: '15m',
    text: 'Tweet 2: Reply, has-parent only. No connector between 1 and 2.',
    numReplies: 0,
    numRetweets: 0,
    numLikes: 2,
    hasParent: true
  },
  {
    id: 'sample-3',
    username: 'bob_network',
    time: '17m',
    text: 'Tweet 3: Parent of next reply (has-child). Connector shows below to Tweet 4.',
    numReplies: 1,
    numRetweets: 0,
    numLikes: 3,
    hasChild: true
  },
  {
    id: 'sample-4',
    username: 'carol',
    time: '20m',
    text: 'Tweet 4: Reply, has-parent. Connector between 3 and 4.',
    numReplies: 0,
    numRetweets: 0,
    numLikes: 1,
    hasParent: true
  },
  {
    id: 'sample-5',
    username: 'validator_news',
    time: '1h',
    text: 'Tweet 5: Standalone, no thread classes. No connector.',
    numReplies: 0,
    numRetweets: 0,
    numLikes: 0
  }
];

class NotificationsMain {
	constructor(app, mod, container = '.saito-container') {
		this.app = app;
		this.mod = mod;
		this.container = container;

		this.threadOverlay = null;
		this.threadResizeObserver = null;
		this.threadDrawRaf = null;
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

		this.ensureThreadOverlay(container);
		this.drawThreadConnectors(container);
		this.ensureThreadResizeObserver(container);
	}

	ensureThreadOverlay(container) {
		if (this.threadOverlay && this.threadOverlay.parentElement === container) return;

		this.threadOverlay = container.querySelector('.notifications-thread-overlay');
		if (!this.threadOverlay) {
			this.threadOverlay = document.createElement('div');
			this.threadOverlay.className = 'notifications-thread-overlay';
			container.appendChild(this.threadOverlay);
		}
	}

	queueThreadRedraw(container) {
		if (this.threadDrawRaf) return;

		this.threadDrawRaf = window.requestAnimationFrame(() => {
			this.threadDrawRaf = null;
			this.drawThreadConnectors(container);
		});
	}

	drawThreadConnectors(container) {
		if (!this.threadOverlay || this.threadOverlay.parentElement !== container) return;

		// Clear and redraw; connector lines are absolutely positioned so they don't affect layout.
		this.threadOverlay.innerHTML = '';

		const containerRect = container.getBoundingClientRect();
		const tweets = Array.from(container.querySelectorAll('.saito-tweet'));

		for (let i = 0; i < tweets.length - 1; i++) {
			const tweetA = tweets[i];
			const tweetB = tweets[i + 1];

			if (!tweetA.classList.contains('has-child')) continue;
			if (!tweetB.classList.contains('has-parent')) continue;

			const avatarA = tweetA.querySelector('.avatar');
			const avatarB = tweetB.querySelector('.avatar');
			if (!avatarA || !avatarB) continue;

			const avatarARect = avatarA.getBoundingClientRect();
			const avatarBRect = avatarB.getBoundingClientRect();

			const xCenter = avatarARect.left + avatarARect.width / 2 - containerRect.left;
			const yStart = avatarARect.bottom - containerRect.top;
			const yEnd = avatarBRect.top - containerRect.top;
			const height = yEnd - yStart;

			// If avatars overlap or are mis-ordered, skip drawing.
			if (!(height > 0)) continue;

			const line = document.createElement('div');
			line.className = 'notifications-thread-connector';
			line.style.left = `${xCenter}px`;
			line.style.top = `${yStart}px`;
			line.style.height = `${height}px`;
			line.style.width = `2px`;
			line.style.background = `rgba(0, 0, 0, 0.12)`;
			line.style.borderRadius = `1px`;
			line.style.position = `absolute`;
			line.style.pointerEvents = `none`;
			line.style.transform = 'translateX(-50%)';
			this.threadOverlay.appendChild(line);
		}
	}

	ensureThreadResizeObserver(container) {
		if (!window.ResizeObserver) return;

		if (this.threadResizeObserver) return;

		this.threadResizeObserver = new ResizeObserver(() => {
			this.queueThreadRedraw(container);
		});

		this.threadResizeObserver.observe(container);
	}
}

module.exports = NotificationsMain;
