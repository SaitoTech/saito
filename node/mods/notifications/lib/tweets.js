const TweetsTemplate = require('./tweets.template');

class Tweets {
	constructor(app, mod, container) {
		this.app = app;
		this.mod = mod;
		this.container = container;

		this.thread_resize_observer = null;
		this.thread_draw_raf = null;
	}

	queueThreadRedraw() {
		if (this.thread_draw_raf != null) return;

		this.thread_draw_raf = window.requestAnimationFrame(() => {
			this.thread_draw_raf = null;
			this.drawThreadConnectors();
		});
	}

	ensureThreadResizeObserver(panel_el) {
		if (this.thread_resize_observer) {
			this.thread_resize_observer.disconnect();
			this.thread_resize_observer = null;
		}
		if (!window.ResizeObserver) return;

		this.thread_resize_observer = new ResizeObserver(() => {
			this.queueThreadRedraw();
		});

		this.thread_resize_observer.observe(panel_el);
	}

	drawThreadConnectors() {
		const panel_el = document.querySelector('.notifications-center .tweets');
		if (!panel_el) return;
		const connectors_el = panel_el.querySelector('.connectors');
		if (!connectors_el) return;

		const container_rect = panel_el.getBoundingClientRect();
		const tweet_els = Array.from(
			panel_el.querySelectorAll('.tweet:not(.is_embedded)')
		);

		const line_specs = [];
		for (let idx = 0; idx < tweet_els.length - 1; idx++) {
			const tweet_a = tweet_els[idx];
			const tweet_b = tweet_els[idx + 1];

			if (!tweet_a.classList.contains('has_child')) continue;
			if (!tweet_b.classList.contains('has_parent')) continue;

			const avatar_a = tweet_a.querySelector('.avatar');
			const avatar_b = tweet_b.querySelector('.avatar');
			if (!avatar_a || !avatar_b) continue;

			const avatar_a_rect = avatar_a.getBoundingClientRect();
			const avatar_b_rect = avatar_b.getBoundingClientRect();

			const x_center = avatar_a_rect.left + avatar_a_rect.width / 2 - container_rect.left;
			const y_start = avatar_a_rect.bottom - container_rect.top;
			const y_end = avatar_b_rect.top - container_rect.top;
			const height = y_end - y_start;

			if (!(height > 0)) continue;

			line_specs.push({ left: x_center, top: y_start, height });
		}

		const html =
			line_specs.length === 0
				? ''
				: line_specs
						.map(
							(ln) =>
								`<div class="tweets-connector" style="left:${ln.left}px;top:${ln.top}px;height:${ln.height}px"></div>`
						)
						.join('');

		this.app.browser.replaceElementContentBySelector(html, '.connectors');
	}

	ensureTweetsPanelInDom() {
		if (!document.querySelector('.tweets')) {
			this.app.browser.addElementToSelector(
				TweetsTemplate(this),
				'.notifications-center'
			);
		} else {
			this.app.browser.replaceElementBySelector(
				TweetsTemplate(this),
				'.tweets'
			);
		}
	}

	render() {
		this.tweets = this.mod.tweets;

		this.ensureTweetsPanelInDom();

		const panel_el = document.querySelector('.notifications-center .tweets');

		Object.values(this.tweets).forEach((tweet) => {
			tweet.render();
		});

		if (panel_el) {
			this.drawThreadConnectors();
			this.ensureThreadResizeObserver(panel_el);
		}
	}
}

module.exports = Tweets;
