const AllBlocksTemplate = require('./all-blocks.template');
const { formatBlocksForTeaser } = require('../explorer-format');
const { requestBlocksFromPeer } = require('../peer/client');

const PAGE_SIZE = 25;

class AllBlocks {
	constructor(app, mod) {
		this.app = app;
		this.mod = mod;
		this.container = '.explorer-view';
		this.rawBlocks = [];
		this.loading = true;
		this.loadingMore = false;
		this.hasMore = true;
		this.error = null;
		this.scrollHandler = null;
	}

	render(container = '') {
		if (container) {
			this.container = container;
		}

		this.rawBlocks = [];
		this.loading = true;
		this.loadingMore = false;
		this.hasMore = true;
		this.error = null;
		this.paint();
		this.loadInitial();
	}

	paint() {
		const blocks = formatBlocksForTeaser(this.app, this.rawBlocks);

		this.app.browser.replaceElementContentBySelector(
			AllBlocksTemplate({
				blocks,
				loading: this.loading,
				loadingMore: this.loadingMore,
				hasMore: this.hasMore,
				error: this.error,
			}),
			this.container
		);

		this.attachEvents();
	}

	attachEvents() {
		document.querySelectorAll('.explorer-all-blocks-feed .explorer-feed-item[data-block-hash]').forEach((el) => {
			const navigate = (event) => {
				if (event?.target?.closest('.explorer-pubkey-link')) {
					return;
				}
				event?.preventDefault?.();
				const hash = el.getAttribute('data-block-hash');
				if (hash) {
					this.cleanup();
					this.mod.renderBlock(hash, { pushState: true, animate: true });
				}
			};
			el.onclick = navigate;
			el.onkeydown = (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					navigate(event);
				}
			};
		});

		const loadMoreBtn = document.querySelector('.explorer-load-more-btn');
		if (loadMoreBtn) {
			loadMoreBtn.onclick = () => this.loadMore();
		}

		this.setupScrollListener();
	}

	setupScrollListener() {
		this.cleanupScroll();
		this.scrollHandler = () => {
			if (this.loadingMore || !this.hasMore) return;
			const sentinel = document.querySelector('.explorer-load-more');
			if (!sentinel) return;
			const rect = sentinel.getBoundingClientRect();
			if (rect.top < window.innerHeight + 200) {
				this.loadMore();
			}
		};
		window.addEventListener('scroll', this.scrollHandler, { passive: true });
	}

	cleanupScroll() {
		if (this.scrollHandler) {
			window.removeEventListener('scroll', this.scrollHandler);
			this.scrollHandler = null;
		}
	}

	cleanup() {
		this.cleanupScroll();
	}

	getSmallestBlockId() {
		let smallest = Infinity;
		for (let i = 0; i < this.rawBlocks.length; i++) {
			const id = Number(this.rawBlocks[i]?.id);
			if (Number.isFinite(id) && id < smallest) {
				smallest = id;
			}
		}
		return Number.isFinite(smallest) ? smallest : null;
	}

	loadInitial() {
		const peer = this.mod.explorerPeer;
		if (!peer) {
			this.loading = false;
			this.error = 'Waiting for Explorer peer connection.';
			this.paint();
			return;
		}

		requestBlocksFromPeer(this.app, peer, { count: PAGE_SIZE, include_offchain: false }, (response) => {
			this.loading = false;
			if (response?.err || !response?.success) {
				this.error = response?.error || 'Failed to load blocks.';
				this.paint();
				return;
			}
			const data = Array.isArray(response.data) ? response.data : [];
			this.rawBlocks = data;
			this.hasMore = data.length >= PAGE_SIZE;
			this.paint();
		});
	}

	loadMore() {
		if (this.loadingMore || !this.hasMore) return;

		const peer = this.mod.explorerPeer;
		if (!peer) return;

		const beforeId = this.getSmallestBlockId();
		if (!beforeId || beforeId <= 1) {
			this.hasMore = false;
			this.paint();
			return;
		}

		this.loadingMore = true;
		this.paint();

		requestBlocksFromPeer(
			this.app,
			peer,
			{ count: PAGE_SIZE, include_offchain: false, before_id: beforeId },
			(response) => {
				this.loadingMore = false;
				if (response?.err || !response?.success) {
					this.hasMore = false;
					this.paint();
					return;
				}
				const data = Array.isArray(response.data) ? response.data : [];
				if (data.length === 0) {
					this.hasMore = false;
				} else {
					this.rawBlocks = this.rawBlocks.concat(data);
					this.hasMore = data.length >= PAGE_SIZE;
				}
				this.paint();
			}
		);
	}
}

module.exports = AllBlocks;
