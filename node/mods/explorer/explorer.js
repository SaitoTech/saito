const ModTemplate = require('../../lib/templates/modtemplate');
const SaitoHeader = require('../../lib/saito/ui/saito-header/saito-header');
const Main = require('./lib/ui/main');
const Block = require('./lib/ui/block');
const Supply = require('./lib/ui/supply');
const Address = require('./lib/ui/address');
const AllBlocks = require('./lib/ui/all-blocks');
const AllTransactions = require('./lib/ui/all-transactions');
const Search = require('./lib/ui/search');
const ShellTemplate = require('./lib/ui/shell.template');
const { transitionView } = require('./lib/ui/transitions');
const index = require('./index');
const PeerService = require('saito-js/lib/peer_service').default;
const { handleExplorerRequest } = require('./lib/peer/requests');
const { sendExplorerPeerRequest } = require('./lib/peer/client');
const { success, failure } = require('./lib/peer/response');
const ExplorerDatabase = require('./lib/database');
const { buildBlockStatistics } = require('./lib/block-statistics');
const { backfillSupplyStatistics } = require('./lib/supply-accounting');
const { buildAddressRowsFromBlock, blockContainsAtrTransaction } = require('./lib/address-index');
const { SUPPLY_BLOCK_COUNT } = require('./lib/supply-rows');
const {
	extractTransactionsFromBlocks,
	mergeBlockByHash,
} = require('./lib/explorer-format');
const {
	EXPLORER_ENSURE_TEST_MODE_REQUEST,
	EXPLORER_PRODUCE_BLOCK_REQUEST,
	EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST,
	canShowManualBlockControls,
} = require('./lib/manual-block-production');
const {
	enterExplorerTestMode: setExplorerTestMode,
	ensureExplorerTestModeForManualAction,
	runManualBlockProductionRequest,
} = require('./lib/explorer-test-mode');
const {
	startManualProductionCountdown,
	stopManualProductionCountdown,
} = require('./lib/manual-production-countdown');
const { produceExplorerBlockWithoutGt } = require('./lib/produce-block-without-gt');
const { produceExplorerBlockWithGt } = require('./lib/produce-block-with-gt');
const { logManualProduction } = require('./lib/manual-production-log');

class Explorer extends ModTemplate {

	constructor(app) {
		super(app);

		this.name = 'Explorer';
		this.slug = 'explorer';
		this.dbname = 'explorer';
		this.description = 'Saito Blockchain Explorer';
		this.categories = 'Utilities Information';

		this.INDEX_BLOCKS = 1;
		this.INDEX_PUBLICKEYS = 1;

		this.main = null;
		this.blockComponent = null;
		this.supplyComponent = null;
		this.addressComponent = null;
		this.allBlocksComponent = null;
		this.allTransactionsComponent = null;
		this.search = null;
		this.header = null;
		this.shellRendered = false;
		this.activeView = 'home';
		this.blockHash = null;
		this.addressPublicKey = null;
		this.navigationBound = false;
		this.styles = ['/saito/saito.css', `/${this.slug}/style.css`];

		this.blocks = [];
		this.transactions = [];
		this.blocksReady = false;
		this.transactionsReady = false;
		this.blocksError = null;
		this.transactionsError = null;
		this.explorerPeer = null;

		this.chainInfo = null;
		this.chainInfoReady = false;
		this.chainInfoError = null;

		this.supplyView = null;
		this.supplyReady = false;
		this.supplyError = null;

		this.addressRows = [];
		this.addressReady = false;
		this.addressError = null;

		this.test_mode = false;
		this.enable_manual_testing = true;
		this.manualProduction = null;
		this.produceUiRequest = null;
		this.produceUiTimerId = null;
		this.simulationToolbarMessage = '';
		this.simulationToolbarIsError = false;
	}

	returnServices() {
		let services = [];
		if (this.app.BROWSER == 0) {
			services.push(new PeerService(null, 'Explorer'));
		}
		return services;
	}

	parseRoute() {
		const path = window.location.pathname.replace(/\/+$/, '');
		const prefix = `/${this?.slug || 'explorer'}`;
		const blockMatch = path.match(new RegExp(`^${prefix}/block/([^/]+)$`));
		const supplyMatch = path.match(new RegExp(`^${prefix}/supply$`));
		const addressMatch = path.match(new RegExp(`^${prefix}/address/([^/]+)$`));
		const allBlocksMatch = path.match(new RegExp(`^${prefix}/blocks$`));
		const allTransactionsMatch = path.match(new RegExp(`^${prefix}/transactions$`));

		if (blockMatch) {
			return {
				view: 'block',
				hash: decodeURIComponent(blockMatch[1]),
			};
		}

		if (supplyMatch) {
			return { view: 'supply' };
		}

		if (addressMatch) {
			return {
				view: 'address',
				publicKey: decodeURIComponent(addressMatch[1]),
			};
		}

		if (allBlocksMatch) {
			return { view: 'allBlocks' };
		}

		if (allTransactionsMatch) {
			return { view: 'allTransactions' };
		}

		return { view: 'home' };
	}

	ensureShell() {
		if (this.shellRendered) {
			return;
		}

		const container = document.querySelector('.saito-container');
		if (container) {
			container.classList.add('explorer-container');
		}

		this.app.browser.replaceElementContentBySelector(ShellTemplate(), '.saito-container');
		this.shellRendered = true;

		if (!this.search) {
			this.search = new Search(this.app, this);
		}
		this.search.render('.explorer-search');
		this.renderSimulationToolbar();
	}

	bindNavigation() {
		if (this.navigationBound || !this.browser_active) {
			return;
		}

		this.navigationBound = true;

		document.addEventListener('click', (event) => {
			if (!this.browser_active) {
				return;
			}

			const backBtn = event.target.closest('[data-nav="home"], [data-explorer-nav="home"]');
			if (backBtn) {
				event.preventDefault();
				event.stopPropagation();
				this.renderHome({ pushState: true, animate: true });
				return;
			}

			const pubkeyLink = event.target.closest('.explorer-pubkey-link[data-public-key]');
			if (pubkeyLink) {
				event.preventDefault();
				event.stopPropagation();
				const publicKey = pubkeyLink.getAttribute('data-public-key');
				if (publicKey) {
					this.renderAddress(publicKey, { pushState: true, animate: true });
				}
				return;
			}

			const link = event.target.closest('.explorer-footer-link');
			if (link) {
				const href = link.getAttribute('href') || '';
				if (href.endsWith('/explorer/supply')) {
					event.preventDefault();
					this.renderSupply({ pushState: true, animate: true });
				}
				return;
			}

			const viewAllLink = event.target.closest('[data-explorer-nav]');
			if (viewAllLink) {
				const nav = viewAllLink.getAttribute('data-explorer-nav');
				if (nav === 'all-blocks') {
					event.preventDefault();
					event.stopPropagation();
					this.renderAllBlocks({ pushState: true, animate: true });
				} else if (nav === 'all-transactions') {
					event.preventDefault();
					event.stopPropagation();
					this.renderAllTransactions({ pushState: true, animate: true });
				}
			}
		});

		window.addEventListener('popstate', (event) => {
			const state = event.state || this.parseRoute();

			if (state.view === 'block' && state.hash) {
				this.renderBlock(state.hash, {
					pushState: false,
					animate: true,
					expandTxSignature: state.expandTxSignature || null,
				});
				return;
			}

			if (state.view === 'supply') {
				this.renderSupply({ pushState: false, animate: true });
				return;
			}

			if (state.view === 'address' && state.publicKey) {
				this.renderAddress(state.publicKey, { pushState: false, animate: true });
				return;
			}

			if (state.view === 'allBlocks') {
				this.renderAllBlocks({ pushState: false, animate: true });
				return;
			}

			if (state.view === 'allTransactions') {
				this.renderAllTransactions({ pushState: false, animate: true });
				return;
			}

			this.renderHome({ pushState: false, animate: true });
		});
	}

	getViewElement() {
		return document.querySelector('.explorer-view');
	}

	cleanupListViews() {
		if (this.allBlocksComponent) {
			this.allBlocksComponent.cleanup();
			this.allBlocksComponent = null;
		}
		if (this.allTransactionsComponent) {
			this.allTransactionsComponent.cleanup();
			this.allTransactionsComponent = null;
		}
	}

	async renderHome(options = {}) {
		const { pushState = true, animate = true } = options;

		this.activeView = 'home';
		this.blockHash = null;
		this.blockComponent = null;
		this.supplyComponent = null;
		this.addressComponent = null;
		this.addressPublicKey = null;
		this.cleanupListViews();

		if (pushState) {
			window.history.pushState({ view: 'home' }, '', `/${this.slug}`);
		}

		this.ensureShell();

		const renderContent = () => {
			if (!this.main) {
				this.main = new Main(this.app, this);
			}
			this.main.render('.explorer-view');
		};

		if (animate) {
			await transitionView(this.getViewElement(), renderContent);
		} else {
			renderContent();
		}
	}

	async renderSupply(options = {}) {
		const { pushState = true, animate = true } = options;

		this.activeView = 'supply';
		this.blockHash = null;
		this.blockComponent = null;
		this.main = null;
		this.supplyView = null;
		this.supplyReady = false;
		this.supplyError = null;
		this.addressComponent = null;
		this.addressPublicKey = null;
		this.cleanupListViews();

		if (pushState) {
			window.history.pushState({ view: 'supply' }, '', `/${this.slug}/supply`);
		}

		this.ensureShell();

		const renderContent = () => {
			if (!this.supplyComponent) {
				this.supplyComponent = new Supply(this.app, this);
			}
			this.supplyComponent.render('.explorer-view');
		};

		if (animate) {
			await transitionView(this.getViewElement(), renderContent);
		} else {
			renderContent();
		}
	}

	async renderAddress(publicKey, options = {}) {
		const { pushState = true, animate = true } = options;

		if (!publicKey) {
			return;
		}

		this.activeView = 'address';
		this.addressPublicKey = publicKey;
		this.blockHash = null;
		this.blockComponent = null;
		this.main = null;
		this.supplyComponent = null;
		this.addressRows = [];
		this.addressReady = false;
		this.addressError = null;
		this.cleanupListViews();

		if (pushState) {
			window.history.pushState(
				{ view: 'address', publicKey },
				'',
				`/${this.slug}/address/${encodeURIComponent(publicKey)}`
			);
		}

		this.ensureShell();

		const renderContent = () => {
			this.addressComponent = new Address(this.app, this, publicKey);
			this.addressComponent.render('.explorer-view');
		};

		if (animate) {
			await transitionView(this.getViewElement(), renderContent);
		} else {
			renderContent();
		}
	}

	resolveBlockHash(blockHash = '', blockId = '') {
		if (blockHash) {
			return blockHash;
		}

		if (blockId == null || blockId === '') {
			return null;
		}

		const block = (this.blocks || []).find((entry) => String(entry?.id) === String(blockId));
		return block?.hash || null;
	}

	async renderBlock(blockHash, options = {}) {
		const { pushState = true, animate = true, expandTxSignature = null } = options;

		if (!blockHash) {
			return;
		}

		this.activeView = 'block';
		this.blockHash = blockHash;
		this.supplyComponent = null;
		this.addressComponent = null;
		this.addressPublicKey = null;
		this.cleanupListViews();

		if (pushState) {
			const url = `/${this.slug}/block/${encodeURIComponent(blockHash)}`;
			window.history.pushState(
				{ view: 'block', hash: blockHash, expandTxSignature },
				'',
				url
			);
		}

		this.ensureShell();

		const renderContent = () => {
			this.blockComponent = new Block(this.app, this, blockHash, expandTxSignature);
			this.blockComponent.render('.explorer-view');
		};

		if (animate) {
			await transitionView(this.getViewElement(), renderContent);
		} else {
			renderContent();
		}
	}

	async renderAllBlocks(options = {}) {
		const { pushState = true, animate = true } = options;

		this.activeView = 'allBlocks';
		this.blockHash = null;
		this.blockComponent = null;
		this.main = null;
		this.supplyComponent = null;
		this.addressComponent = null;
		this.addressPublicKey = null;
		this.cleanupListViews();

		if (pushState) {
			window.history.pushState({ view: 'allBlocks' }, '', `/${this.slug}/blocks`);
		}

		this.ensureShell();

		const renderContent = () => {
			this.allBlocksComponent = new AllBlocks(this.app, this);
			this.allBlocksComponent.render('.explorer-view');
		};

		if (animate) {
			await transitionView(this.getViewElement(), renderContent);
		} else {
			renderContent();
		}
	}

	async renderAllTransactions(options = {}) {
		const { pushState = true, animate = true } = options;

		this.activeView = 'allTransactions';
		this.blockHash = null;
		this.blockComponent = null;
		this.main = null;
		this.supplyComponent = null;
		this.addressComponent = null;
		this.addressPublicKey = null;
		this.cleanupListViews();

		if (pushState) {
			window.history.pushState({ view: 'allTransactions' }, '', `/${this.slug}/transactions`);
		}

		this.ensureShell();

		const renderContent = () => {
			this.allTransactionsComponent = new AllTransactions(this.app, this);
			this.allTransactionsComponent.render('.explorer-view');
		};

		if (animate) {
			await transitionView(this.getViewElement(), renderContent);
		} else {
			renderContent();
		}
	}

	async onPeerServiceUp(app, peer, service = {}) {
		if (!app.BROWSER || !this.browser_active) {
			return;
		}

		if (service.service !== 'Explorer') {
			return;
		}

		this.explorerPeer = peer;
		this.blocksReady = false;
		this.transactionsReady = false;
		this.blocksError = null;
		this.transactionsError = null;
		this.blocks = [];
		this.transactions = [];
		this.chainInfo = null;
		this.chainInfoReady = false;
		this.chainInfoError = null;
		this.supplyView = null;
		this.supplyReady = false;
		this.supplyError = null;
		this.addressRows = [];
		this.addressReady = false;
		this.addressError = null;

		if (this.activeView === 'allBlocks') {
			this.cleanupListViews();
			this.allBlocksComponent = new AllBlocks(this.app, this);
			this.allBlocksComponent.render('.explorer-view');
			return;
		}

		if (this.activeView === 'allTransactions') {
			this.cleanupListViews();
			this.allTransactionsComponent = new AllTransactions(this.app, this);
			this.allTransactionsComponent.render('.explorer-view');
			return;
		}

		await this.refreshActiveView();

		this.fetchChainInfo(app, peer);

		sendExplorerPeerRequest(app, 'request blocks', {
			data: {
				request: 'request blocks',
				count: 10,
				include_offchain: false,
			},
			callback: async (response) => {
				if (response?.err) {
					console.error('Explorer: block request failed (network)', {
						peer: peer?.publicKey,
						error: response.err,
						response,
					});
					this.blocksError = 'Network error while fetching blocks.';
					this.blocksReady = true;
					this.transactionsError = 'Network error while fetching transactions.';
					this.transactionsReady = true;
					await this.refreshActiveView();
					return;
				}

				if (!response?.success) {
					console.error('Explorer: block request failed', {
						peer: peer?.publicKey,
						error: response?.error || 'unknown error',
						response,
					});
					this.blocksError = response?.error || 'Failed to fetch blocks from Explorer peer.';
					this.blocksReady = true;
					this.transactionsError = 'Waiting for block data before loading transactions.';
					this.transactionsReady = true;
					await this.refreshActiveView();
					return;
				}

				this.blocks = Array.isArray(response.data) ? response.data : [];
				this.blocksReady = true;
				await this.refreshActiveView();

				await this.fetchTransactionData(app, peer);

				if (this.activeView === 'supply') {
					await this.fetchSupplyData(app, peer);
				}

				if (this.activeView === 'address' && this.addressPublicKey) {
					await this.fetchAddressData(app, peer, this.addressPublicKey);
				}
			},
			peer,
		});
	}

	fetchSupplyData(app, peer) {
		this.supplyReady = false;
		this.supplyError = null;
		this.supplyView = null;

		return new Promise((resolve) => {
			sendExplorerPeerRequest(app, 'request supply', {
				data: {
					request: 'request supply',
					count: SUPPLY_BLOCK_COUNT,
				},
				callback: async (response) => {
				if (response?.err) {
					console.error('Explorer: supply request failed (network)', {
						peer: peer?.publicKey,
						error: response.err,
						response,
					});
					this.supplyError = 'Network error while fetching supply data.';
					this.supplyReady = true;
					await this.refreshActiveView();
					resolve();
					return;
				}

				if (!response?.success) {
					console.error('Explorer: supply request failed', {
						peer: peer?.publicKey,
						error: response?.error || 'unknown error',
						response,
					});
					this.supplyError = response?.error || 'Failed to fetch supply data from Explorer peer.';
					this.supplyReady = true;
					await this.refreshActiveView();
					resolve();
					return;
				}

				this.supplyView =
					response.data && typeof response.data === 'object' ? response.data : null;
				this.supplyReady = true;
				await this.refreshActiveView();
				resolve();
			},
			peer,
		});
		});
	}

	fetchAddressData(app, peer, publicKey) {
		this.addressReady = false;
		this.addressError = null;
		this.addressRows = [];

		return new Promise((resolve) => {
			sendExplorerPeerRequest(app, 'request address', {
				data: {
					request: 'request address',
					publickey: String(publicKey),
					count: 100,
				},
				callback: async (response) => {
				if (response?.err) {
					console.error('Explorer: address request failed (network)', {
						peer: peer?.publicKey,
						error: response.err,
						response,
					});
					this.addressError = 'Network error while fetching address activity.';
					this.addressReady = true;
					await this.refreshActiveView();
					resolve();
					return;
				}

				if (!response?.success) {
					console.error('Explorer: address request failed', {
						peer: peer?.publicKey,
						error: response?.error || 'unknown error',
						response,
					});
					this.addressError = response?.error || 'Failed to fetch address activity from Explorer peer.';
					this.addressReady = true;
					await this.refreshActiveView();
					resolve();
					return;
				}

				this.addressRows = Array.isArray(response.data?.rows) ? response.data.rows : [];
				this.addressReady = true;
				await this.refreshActiveView();
				resolve();
			},
			peer,
		});
		});
	}

	requestBlockFromPeerPromise(app, peer, identifier, includeTransactions = true) {
		const data = {
			request: 'request block',
			include_transactions: includeTransactions,
		};

		if (typeof identifier === 'bigint' || typeof identifier === 'number') {
			data.block_id = String(identifier);
		} else {
			data.hash = String(identifier);
		}

		return new Promise((resolve) => {
			sendExplorerPeerRequest(app, 'request block', {
				data,
				callback: (response) => {
				if (response?.success && response.data) {
					resolve(response.data);
					return;
				}
				resolve(null);
			},
			peer,
		});
		});
	}

	async fetchTransactionData(app, peer) {
		this.transactionsReady = false;
		this.transactionsError = null;
		this.transactions = [];

		if (!this.blocks?.length) {
			this.transactionsReady = true;
			await this.refreshActiveView();
			return;
		}

		const fetchCount = Math.min(5, this.blocks.length);

		try {
			const requests = [];
			for (let i = 0; i < fetchCount; i++) {
				const block = this.blocks[i];
				const id = block?.hash || block?.id;
				if (id == null || id === '') {
					continue;
				}
				requests.push(this.requestBlockFromPeerPromise(app, peer, id, true));
			}

			const results = await Promise.all(requests);
			let enrichedBlocks = this.blocks.slice();
			for (let i = 0; i < results.length; i++) {
				const fullBlock = results[i];
				if (fullBlock) {
					enrichedBlocks = mergeBlockByHash(enrichedBlocks, fullBlock);
				}
			}

			this.blocks = enrichedBlocks;
			this.transactions = extractTransactionsFromBlocks(enrichedBlocks);
			this.transactionsReady = true;
		} catch (err) {
			console.error('Explorer: failed to fetch transaction data', err);
			this.transactionsError = 'Failed to load recent transactions.';
			this.transactionsReady = true;
		}

		await this.refreshActiveView();
	}

	fetchChainInfo(app, peer) {
		this.chainInfoReady = false;
		this.chainInfoError = null;
		this.chainInfo = null;

		return new Promise((resolve) => {
			sendExplorerPeerRequest(app, 'request info', {
				data: {
					request: 'request info',
				},
				callback: async (response) => {
				if (response?.err) {
					this.chainInfoError = 'Network error while fetching blockchain information.';
					this.chainInfoReady = true;
					await this.refreshActiveView();
					resolve();
					return;
				}

				if (!response?.success) {
					this.chainInfoError =
						response?.error || 'Failed to fetch blockchain information from Explorer peer.';
					this.chainInfoReady = true;
					await this.refreshActiveView();
					resolve();
					return;
				}

				this.chainInfo = response.data || null;
				this.chainInfoReady = true;
				await this.refreshActiveView();
				resolve();
			},
			peer,
		});
		});
	}

	async refreshActiveView() {
		if (this.activeView === 'home' && this.main) {
			this.main.render('.explorer-view');
			return;
		}

		if (this.activeView === 'supply' && this.supplyComponent) {
			this.supplyComponent.paint();
			return;
		}

		if (this.activeView === 'address' && this.addressComponent) {
			this.addressComponent.paint();
		}
	}

	canExposeManualBlockProduction() {
		return canShowManualBlockControls(this.app, this);
	}

	setSimulationToolbarMessage(message, { isError = false } = {}) {
		this.simulationToolbarMessage = message || '';
		this.simulationToolbarIsError = Boolean(isError);
		this.renderSimulationToolbar();
	}

	clearSimulationToolbarMessage() {
		this.setSimulationToolbarMessage('');
	}

	renderSimulationToolbar() {
		if (!this.browser_active) {
			return;
		}

		const el = document.querySelector('[data-explorer-simulation-status]');
		if (!el) {
			return;
		}

		el.textContent = this.simulationToolbarMessage || '';
		el.classList.toggle('is-error', Boolean(this.simulationToolbarIsError && this.simulationToolbarMessage));
	}

	async refreshSupplyAfterProduce() {
		if (this.activeView === 'supply' && this.explorerPeer) {
			await this.fetchSupplyData(this.app, this.explorerPeer);
		} else if (this.activeView === 'supply' && this.supplyComponent) {
			this.supplyComponent.paint();
		}
	}

	async getBrowserLatestBlockId() {
		try {
			const blocks = await this.app.core.blockchain.getBlocks(1, false);
			const latest = Array.isArray(blocks) && blocks.length ? blocks[0] : null;
			const blockId = Number(latest?.id);
			return Number.isFinite(blockId) ? blockId : 0;
		} catch (err) {
			return 0;
		}
	}

	beginManualProductionUI(request) {
		this.produceUiRequest = request;
		this.setSimulationToolbarMessage('Mining Golden Ticket...');
		return startManualProductionCountdown(this.app, this, request);
	}

	stopManualProductionUI() {
		stopManualProductionCountdown(this);
		this.produceUiRequest = null;
	}

	enterExplorerTestMode(app) {
		setExplorerTestMode(app, this);
	}

	async handlePeerTransaction(app, tx = null, peer, mycallback) {
		if (tx == null) {
			return 0;
		}

		if (app.BROWSER == 1) {
			return super.handlePeerTransaction(app, tx, peer, mycallback);
		}

		let txmsg = tx.returnMessage();

		if (txmsg?.request === EXPLORER_ENSURE_TEST_MODE_REQUEST) {
			const gate = ensureExplorerTestModeForManualAction(app, this);
			if (!gate.ok) {
				if (mycallback) {
					mycallback(failure(gate.error));
				}
				return 1;
			}

			if (mycallback) {
				mycallback(success({ accepted: true }));
			}
			return 1;
		}

		const produceBlockHandlers = {
			[EXPLORER_PRODUCE_BLOCK_REQUEST]: produceExplorerBlockWithoutGt,
			[EXPLORER_PRODUCE_BLOCK_WITH_GT_REQUEST]: produceExplorerBlockWithGt,
		};
		const produceExplorerBlock = produceBlockHandlers[txmsg?.request];

		if (produceExplorerBlock) {
			logManualProduction(
				`handlePeerTransaction: produce request received type=${txmsg?.request}, ` +
					`peer=${peer?.publicKey || '(unknown)'}`
			);
			runManualBlockProductionRequest(
				app,
				this,
				produceExplorerBlock,
				mycallback,
				txmsg?.request
			);
			return 1;
		}

		let response = await handleExplorerRequest(app, txmsg, this);

		if (response !== null) {
			if (mycallback) {
				mycallback(response);
				return 1;
			}
		}

		return super.handlePeerTransaction(app, tx, peer, mycallback);
	}

	async initialize(app) {
		await super.initialize(app);

		if (app.BROWSER == 0) {
			this.database = new ExplorerDatabase(app, this);
			setImmediate(() => {
				backfillSupplyStatistics(app, this).catch((err) => {
					console.error('Explorer: supply statistics backfill failed', err);
				});
			});
		}

		if (this.browser_active) {
			this.header = new SaitoHeader(this.app, this);
			await this.header.initialize(this.app);
			this.bindNavigation();
		}
	}

	async render() {
		await super.render();

		if (!this.browser_active) {
			return;
		}

		if (this.header) {
			await this.header.render();
		}

		this.ensureShell();

		const route = this.parseRoute();

		if (route.view === 'block' && route.hash) {
			await this.renderBlock(route.hash, { pushState: false, animate: false });
			return;
		}

		if (route.view === 'supply') {
			await this.renderSupply({ pushState: false, animate: false });
			return;
		}

		if (route.view === 'address' && route.publicKey) {
			await this.renderAddress(route.publicKey, { pushState: false, animate: false });
			return;
		}

		if (route.view === 'allBlocks') {
			await this.renderAllBlocks({ pushState: false, animate: false });
			return;
		}

		if (route.view === 'allTransactions') {
			await this.renderAllTransactions({ pushState: false, animate: false });
			return;
		}

		await this.renderHome({ pushState: false, animate: false });
	}

	async onNewBlock(block, lc) {
		if (this.app.BROWSER == 1) {
			return;
		}

		if (!block?.id || !this.database) {
			return;
		}

		if (this.INDEX_BLOCKS) {
			try {
				const stats = await buildBlockStatistics(this.app, this, block);
				await this.database.upsertBlockStatistics(stats);
			} catch (err) {
				console.error('Explorer: failed to record block statistics', err);
			}
		}

		if (!this.INDEX_PUBLICKEYS) {
			return;
		}

		try {
			const addressRows = buildAddressRowsFromBlock(this.app, block, Boolean(lc));
			await this.database.insertAddressRows(addressRows);

			if (blockContainsAtrTransaction(block)) {
				this.scheduleAddressPruningOnAtr(Number(block.id));
			}
		} catch (err) {
			console.error('Explorer: failed to record address activity', err);
		}
	}

	scheduleAddressPruningOnAtr(blockId) {
		if (!Number.isFinite(blockId) || blockId <= 0 || !this.database) {
			return;
		}

		setImmediate(() => {
			this.database.pruneAddressesBeforeBlockId(blockId).catch((err) => {
				console.error('Explorer: ATR address pruning failed', err);
			});
		});
	}

	async onChainReorganization(block_id, block_hash, lc) {
		if (this.app.BROWSER !== 0 || !this.database || !this.INDEX_PUBLICKEYS) {
			return;
		}

		try {
			await this.database.updateAddressLongestChainState(block_id, block_hash, lc);
		} catch (err) {
			console.error('Explorer: failed to update address longest-chain state', err);
		}
	}

	webServer(app, expressapp, express, alternative_slug = null) {
		const webdir = `${__dirname}/../../mods/${this.dirname}/web`;
		const uri = alternative_slug || '/' + encodeURI(this.returnSlug());
		const self = this;

		expressapp.use(uri, express.static(webdir));

		const sendIndex = async function (req, res) {
			const html = index(app, self, app.build_number);
			res.setHeader('Content-type', 'text/html');
			res.charset = 'UTF-8';
			return res.send(html);
		};

		// Legacy query-parameter URLs are permanently redirected (HTTP 301) to
		// their canonical REST-style equivalents so old bookmarks, links, and
		// search-engine results keep working while the explorer exposes a single
		// canonical URL per resource. The supplied identifier is preserved
		// exactly (encoded the same way the canonical routes are generated);
		// missing/blank parameters fall back gracefully to the explorer home.
		const firstQueryValue = function (value) {
			return Array.isArray(value) ? value[0] : value;
		};

		// /explorer/balance?pubkey=<key>  ->  /explorer/address/<key>
		expressapp.get(`${uri}/balance`, function (req, res) {
			const pubkey = firstQueryValue(req.query.pubkey);
			if (typeof pubkey === 'string' && pubkey.trim() !== '') {
				return res.redirect(301, `${uri}/address/${encodeURIComponent(pubkey)}`);
			}
			return res.redirect(301, uri);
		});

		// /explorer/block?hash=<hash>  ->  /explorer/block/<hash>
		expressapp.get(`${uri}/block`, function (req, res) {
			const hash = firstQueryValue(req.query.hash);
			if (typeof hash === 'string' && hash.trim() !== '') {
				return res.redirect(301, `${uri}/block/${encodeURIComponent(hash)}`);
			}
			return res.redirect(301, uri);
		});

		expressapp.get(`${uri}/block/:hash`, sendIndex);
		expressapp.get(`${uri}/blocks`, sendIndex);
		expressapp.get(`${uri}/transactions`, sendIndex);
		expressapp.get(`${uri}/supply`, sendIndex);
		expressapp.get(`${uri}/address/:publickey`, sendIndex);
		expressapp.get(uri, sendIndex);
	}

}

module.exports = Explorer;
