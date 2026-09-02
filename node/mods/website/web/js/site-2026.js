// Progressive enhancement for the Websitex landing-page experiment.
document.documentElement.classList.add('has-js');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = document.querySelector('[data-site-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileNavigation = document.querySelector('[data-mobile-nav]');
const saitoMenuProxy = document.querySelector('[data-header-open-saito]');
const mobileNavigationLinks = mobileNavigation?.querySelectorAll('a') || [];
const desktopNavigationLinks = document.querySelectorAll('.desktop-nav a');
const mobileAppDock = document.querySelector('[data-open-apps]');
const appsSection = document.querySelector('#apps');

function mobileMenuTargetsSaito() {
  return Boolean(
    header?.classList.contains('network-online') &&
    document.body.classList.contains('saito-shell-ready') &&
    saitoMenuProxy
  );
}

function syncMobileMenuTarget(isOpen = false) {
  if (!menuToggle) {
    return;
  }

  const targetsSaito = mobileMenuTargetsSaito();
  menuToggle.setAttribute('aria-expanded', String(targetsSaito && isOpen));
  menuToggle.setAttribute('aria-controls', targetsSaito ? 'saito-sidebar' : 'mobile-navigation');
  menuToggle.setAttribute(
    'aria-label',
    targetsSaito && isOpen
      ? 'Close Saito menu'
      : targetsSaito
        ? 'Open Saito menu'
        : 'Open navigation'
  );
}

function setMenuState(isOpen) {
  if (!menuToggle || !mobileNavigation) {
    return;
  }

  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  mobileNavigation.classList.toggle('is-open', isOpen);
  mobileNavigation.inert = !isOpen;
  header?.classList.toggle('menu-active', isOpen);
  document.body.classList.toggle('menu-open', isOpen);

  if (isOpen) {
    mobileNavigation.querySelector('a')?.focus();
  } else {
    menuToggle.focus();
  }
}

menuToggle?.addEventListener('click', () => {
  if (mobileMenuTargetsSaito()) {
    saitoMenuProxy.click();
    return;
  }

  setMenuState(menuToggle.getAttribute('aria-expanded') !== 'true');
});

window.addEventListener('saito-header-menu-state', (event) => {
  if (mobileMenuTargetsSaito()) {
    syncMobileMenuTarget(Boolean(event.detail?.open));
  }
});

mobileNavigationLinks.forEach((link) => {
  link.addEventListener('click', () => setMenuState(false));
});

window.addEventListener('resize', () => {
  if (
    window.innerWidth > 820 &&
    menuToggle?.getAttribute('aria-expanded') === 'true' &&
    !mobileMenuTargetsSaito()
  ) {
    setMenuState(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
    if (mobileMenuTargetsSaito()) {
      saitoMenuProxy.click();
    } else {
      setMenuState(false);
    }
  }

  if (
    event.key === 'Tab' &&
    menuToggle?.getAttribute('aria-expanded') === 'true' &&
    !mobileMenuTargetsSaito() &&
    mobileNavigation
  ) {
    const focusable = [
      menuToggle,
      ...mobileNavigation.querySelectorAll('a[href], button:not([disabled])')
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

window.addEventListener(
  'scroll',
  () => {
    header?.classList.toggle('is-scrolled', window.scrollY > 24);
  },
  { passive: true }
);

const navigationSections = [
  ...document.querySelectorAll('#apps, #network, #ownership, #developers, #community')
];

if ('IntersectionObserver' in window) {
  const navigationObserver = new IntersectionObserver(
    (entries) => {
      const visibleSection = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visibleSection) {
        return;
      }

      desktopNavigationLinks.forEach((link) => {
        link.classList.toggle(
          'is-current',
          link.getAttribute('href') === `#${visibleSection.target.id}`
        );
      });
    },
    {
      rootMargin: '-30% 0px -55%',
      threshold: [0, 0.2, 0.5]
    }
  );

  navigationSections.forEach((section) => navigationObserver.observe(section));

  const revealTargets = document.querySelectorAll(
    '.section-heading, .ownership-intro, .developer-copy, .evidence-lead'
  );
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -12%', threshold: 0.12 }
  );

  revealTargets.forEach((target) => {
    target.dataset.observe = '';
    revealObserver.observe(target);
  });

  if (appsSection && mobileAppDock) {
    const appDockObserver = new IntersectionObserver(
      ([entry]) => {
        mobileAppDock.classList.toggle('is-hidden', entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    appDockObserver.observe(appsSection);
  }
}

mobileAppDock?.addEventListener('click', () => {
  appsSection?.scrollIntoView({
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
    block: 'start'
  });
});

const trafficDialog = document.querySelector('[data-traffic-dialog]');
const openTrafficDialog = document.querySelector('[data-traffic-dialog-open]');
const closeTrafficDialog = document.querySelector('[data-traffic-dialog-close]');
const trafficAnimation = document.querySelector('[data-traffic-animation]');
const mobileRouteDialogQuery = window.matchMedia('(max-width: 820px)');
const routeDialog = document.querySelector('[data-route-dialog]');
const routeDialogContent = document.querySelector('[data-route-dialog-content]');
const closeRouteDialog = document.querySelector('[data-route-dialog-close]');
const routeVisual = document.querySelector('.network-story > .route-visual');
const routeVisualHome = routeVisual?.parentElement;
const routeVisualNextSibling = routeVisual?.nextSibling;

async function loadTrafficAnimation() {
  if (!trafficAnimation?.dataset.src) {
    return;
  }

  try {
    const response = await fetch(trafficAnimation.dataset.src);

    if (!response.ok) {
      throw new Error(`SVG request failed with status ${response.status}`);
    }

    const source = await response.text();
    const svgDocument = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = svgDocument.documentElement;

    if (svg.nodeName.toLowerCase() !== 'svg' || svg.querySelector('parsererror')) {
      throw new Error('SVG response could not be parsed');
    }

    const sourceScript = svg.querySelector('script');
    sourceScript?.remove();
    svg.querySelectorAll('style').forEach((style) => {
      style.replaceChildren(svgDocument.createTextNode(style.textContent));
    });
    svg.style.setProperty('background', 'transparent', 'important');
    svg.style.setProperty('background-color', 'transparent', 'important');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    trafficAnimation.replaceChildren(document.importNode(svg, true));

    if (sourceScript?.textContent) {
      const runtime = document.createElement('script');
      runtime.dataset.trafficAnimationRuntime = '';
      runtime.textContent = sourceScript.textContent;
      document.body.append(runtime);
    }
  } catch (error) {
    console.warn('Unable to load the traffic animation:', error);
  }
}

loadTrafficAnimation();

function setTrafficDialogState(isOpen) {
  if (!trafficDialog) {
    return;
  }

  if (isOpen) {
    trafficDialog.showModal();
    document.body.classList.add('traffic-dialog-open');
    closeTrafficDialog?.focus();
  } else {
    trafficDialog.close();
  }
}

function restoreRouteVisual() {
  if (!routeVisual || !routeVisualHome) {
    return;
  }

  routeVisualHome.insertBefore(routeVisual, routeVisualNextSibling || null);
}

function setRouteDialogState(isOpen) {
  if (!routeDialog || !routeDialogContent || !routeVisual) {
    return;
  }

  if (isOpen) {
    if (routeDialog.open) {
      return;
    }

    routeDialogContent.append(routeVisual);
    routeDialog.showModal();
    document.body.classList.add('route-dialog-open');
    closeRouteDialog?.focus();
  } else if (routeDialog.open) {
    routeDialog.close();
  }
}

openTrafficDialog?.addEventListener('click', () => {
  if (mobileRouteDialogQuery.matches) {
    setRouteDialogState(true);
  } else {
    setTrafficDialogState(true);
  }
});
closeTrafficDialog?.addEventListener('click', () => setTrafficDialogState(false));
closeRouteDialog?.addEventListener('click', () => setRouteDialogState(false));

trafficDialog?.addEventListener('close', () => {
  document.body.classList.remove('traffic-dialog-open');
  openTrafficDialog?.focus();
});

trafficDialog?.addEventListener('click', (event) => {
  if (event.target === trafficDialog) {
    setTrafficDialogState(false);
  }
});

routeDialog?.addEventListener('close', () => {
  document.body.classList.remove('route-dialog-open');
  restoreRouteVisual();
  openTrafficDialog?.focus();
});

routeDialog?.addEventListener('click', (event) => {
  if (event.target === routeDialog) {
    setRouteDialogState(false);
  }
});

mobileRouteDialogQuery.addEventListener('change', (event) => {
  if (!event.matches && routeDialog?.open) {
    setRouteDialogState(false);
  }
});

const filterButtons = document.querySelectorAll('[data-app-filter]');
const applicationCards = document.querySelectorAll('[data-app-category]');

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedFilter = button.dataset.appFilter;

    filterButtons.forEach((candidate) => {
      const isSelected = candidate === button;
      candidate.classList.toggle('is-active', isSelected);
      candidate.setAttribute('aria-pressed', String(isSelected));
    });

    applicationCards.forEach((card) => {
      const categories = card.dataset.appCategory.split(' ');
      card.hidden = selectedFilter !== 'all' && !categories.includes(selectedFilter);
    });
  });
});

const networkCheck = document.querySelector('[data-network-check]');
const networkDashboard = document.querySelector('[data-network-dashboard]');
const networkState = document.querySelector('[data-network-state]');
const networkMetrics = document.querySelector('[data-network-metrics]');
const blockPulse = document.querySelector('[data-block-pulse]');
const blockHeight = document.querySelector('[data-block-height]');
const lastBlock = document.querySelector('[data-last-block]');
const browserNodeState = document.querySelector('[data-browser-node-state]');
const browserPublicKey = document.querySelector('[data-browser-public-key]');
const networkJoinPanel = document.querySelector('[data-network-join-panel]');
const networkJoinStatus = document.querySelector('[data-network-join-status]');
const networkJoinPercent = document.querySelector('[data-network-join-percent]');
const networkJoinMeter = document.querySelector('[data-network-join-meter]');
const networkLog = document.querySelector('[data-network-log]');
const peerCount = document.querySelector('[data-peer-count]');
const peerList = document.querySelector('[data-peer-list]');
const networkUpdated = document.querySelector('[data-network-updated]');
let networkChecking = false;
let networkRefreshTimer;
let currentBlockHeight;
let lastBlockTimestamp;
let heartbeatInterval = 30000;
let browserPeers = [];
let browserNodeStarted = false;
let browserNodeLoading = false;
let browserNodeOnline = false;
let nodePeersRefreshing = false;
let browserUpstreamPeer = null;
let restoreConsole = null;

function readStoredBrowserOptions() {
  try {
    const rawOptions = window.localStorage.getItem('options');
    if (!rawOptions || rawOptions === 'null') {
      return { present: false, options: {} };
    }

    return { present: true, options: JSON.parse(rawOptions) || {} };
  } catch (error) {
    return { present: false, options: {} };
  }
}

let storedBrowser = readStoredBrowserOptions();

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(seconds).padStart(2, '0')}s`;
}

function peerAddress(peer) {
  if (peer.address) {
    return peer.address;
  }

  if (!peer.host) {
    return '';
  }

  const protocol = String(peer.protocol || 'https').replace(/:\/\/?$/, '');
  const defaultPort =
    (protocol === 'https' && Number(peer.port) === 443) ||
    (protocol === 'http' && Number(peer.port) === 80);
  return `${protocol}://${peer.host}${peer.port && !defaultPort ? `:${peer.port}` : ''}`;
}

function renderPeers(peers, emptyMessage = 'No live peers are visible yet.', excludedKeys = []) {
  if (!peerList || !peerCount) {
    return;
  }

  const uniquePeers = [];
  const seen = new Set();
  const ownKeys = new Set(
    [storedPublicKey(), browserPublicKey?.textContent, ...excludedKeys].filter(Boolean)
  );

  peers.forEach((peer) => {
    const address = peerAddress(peer);
    const key = peer.publicKey || peer.publickey || '';
    const identifier = key || address;

    if (!identifier || ownKeys.has(key) || seen.has(identifier)) {
      return;
    }

    seen.add(identifier);
    uniquePeers.push({ ...peer, address, publicKey: key });
  });

  peerList.replaceChildren();
  peerCount.textContent = `${uniquePeers.length} live`;

  if (!uniquePeers.length) {
    const empty = document.createElement('li');
    empty.className = 'is-placeholder';
    empty.textContent = emptyMessage;
    peerList.append(empty);
    return;
  }

  uniquePeers.forEach((peer) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'peer-label';
    const address = peer.address.replace(/^https?:\/\//i, '');
    const key = document.createElement('span');
    key.className = 'peer-key';
    key.textContent = peer.publicKey || address || 'Peer';
    label.append(key);

    if (peer.publicKey && address) {
      const peerAddress = document.createElement('span');
      peerAddress.className = 'peer-address';
      peerAddress.textContent = ` (${address})`;
      label.append(peerAddress);
    }

    label.title = `${peer.publicKey || address || 'Peer'}${
      peer.publicKey && address ? ` (${address})` : ''
    }`;
    item.append(label);
    peerList.append(item);
  });
}

function pulseForBlock() {
  if (!blockPulse) {
    return;
  }

  blockPulse.classList.remove('is-new-block');
  void blockPulse.offsetWidth;
  blockPulse.classList.add('is-new-block');
  window.setTimeout(() => blockPulse.classList.remove('is-new-block'), 1100);
}

function updateBlockClocks() {
  if (!lastBlockTimestamp) {
    return;
  }

  const now = Date.now();
  const elapsed = now - lastBlockTimestamp;
  lastBlock.textContent = formatDuration(elapsed);
}

function storedPublicKey(options = storedBrowser.options) {
  return options?.wallet?.publicKey || options?.wallet?.publickey || '';
}

function renderStoredBrowser() {
  storedBrowser = readStoredBrowserOptions();
  const publicKey = storedPublicKey();

  if (publicKey) {
    browserPublicKey.textContent = publicKey;
  } else if (!storedBrowser.present && !browserNodeStarted) {
    browserPublicKey.textContent = '';
  }
}

function trackBrowserUpstream(peers, stage = 'offline') {
  const connectedPeer = peers.find((peer) => peer.connected);
  const candidate = connectedPeer || (stage === 'syncing' ? peers[0] : null);

  if (!candidate) {
    browserUpstreamPeer = null;
    return;
  }

  browserUpstreamPeer = {
    ...candidate,
    address: peerAddress(candidate),
    publicKey: candidate.publicKey || candidate.publickey || '',
    connected: Boolean(connectedPeer)
  };
}

function appendNetworkLog(message) {
  if (!networkLog || !message) {
    return;
  }

  const lines = `${networkLog.textContent}${networkLog.textContent ? '\n' : ''}${message}`
    .split('\n')
    .slice(-80);
  networkLog.textContent = lines.join('\n');
  networkLog.scrollTop = networkLog.scrollHeight;
}

function setJoinStage(message, progress, state = 'busy') {
  networkJoinPanel.hidden = false;
  networkJoinPanel.classList.toggle('is-complete', state === 'complete');
  networkJoinPanel.classList.toggle('is-error', state === 'error');
  networkJoinStatus.textContent = message;
  networkJoinPercent.textContent = `${progress}%`;
  networkJoinMeter.style.width = `${progress}%`;
  browserNodeState.textContent =
    state === 'complete' ? 'ON LINE' : state === 'error' ? 'ERROR' : 'STARTING';
  browserNodeState.classList.toggle('is-live', state === 'complete');
  browserNodeState.classList.toggle('is-busy', state === 'busy');
  browserNodeState.classList.toggle('is-error', state === 'error');
}

function setNetworkAction(state) {
  if (!networkCheck) {
    return;
  }

  networkCheck.disabled = state === 'joining';
  networkCheck.innerHTML =
    state === 'online'
      ? 'Try apps <span aria-hidden="true">↓</span>'
      : state === 'joining'
        ? 'Joining… <span aria-hidden="true">↻</span>'
        : 'Join network <span aria-hidden="true">→</span>';
}

function formatLogValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function captureSaitoLogs() {
  if (restoreConsole) {
    return;
  }

  const originals = {};
  const levels = ['log', 'info', 'warn', 'error'];
  levels.forEach((level) => {
    originals[level] = console[level];
    console[level] = (...values) => {
      originals[level].apply(console, values);
      const message = values.map(formatLogValue).join(' ').slice(0, 1000);

      if (message && (!browserNodeOnline || level === 'info')) {
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        appendNetworkLog(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
      }

      if (/Installing:/i.test(message)) {
        setJoinStage('Loading modules', 68);
      } else if (/lite init|Initializing wallet|Build Number/i.test(message)) {
        setJoinStage('Creating identity', 45);
      }
    };
  });

  restoreConsole = () => {
    levels.forEach((level) => {
      console[level] = originals[level];
    });
    restoreConsole = null;
  };
}

function applyBrowserNetworkStatus(detail = {}) {
  browserNodeStarted = true;
  const publicKey = detail.publicKey || storedPublicKey();
  browserPeers = Array.isArray(detail.peers) ? detail.peers : [];
  const configuredPeers = Array.isArray(detail.configuredPeers) ? detail.configuredPeers : [];
  const peersToRender = browserPeers.length ? browserPeers : configuredPeers;
  const connectedBrowserPeers = browserPeers.filter((peer) => peer.connected);
  const isOnline = detail.stage === 'online' || connectedBrowserPeers.length > 0;

  if (publicKey) {
    browserPublicKey.textContent = publicKey;
  }

  trackBrowserUpstream(peersToRender, detail.stage || 'syncing');

  if (isOnline) {
    networkMetrics.hidden = false;
    renderPeers(connectedBrowserPeers, 'The node has no live peers yet.');
    browserNodeLoading = false;
    setJoinStage('On line', 100, 'complete');
    if (mobileNavigation?.classList.contains('is-open')) {
      setMenuState(false);
    }
    browserNodeOnline = true;
    header?.classList.add('network-online');
    syncMobileMenuTarget(false);
    setNetworkAction('online');
    refreshNodePeers();
    window.Pace?.stop?.();
  } else {
    renderPeers([], 'Connecting to live peers…');
    const wasOnline = browserNodeOnline;
    browserNodeLoading = true;
    const saitoSidebarOpen = document
      .querySelector('.saito-header-hamburger-contents')
      ?.classList.contains('show-menu');
    if (wasOnline && saitoSidebarOpen) {
      saitoMenuProxy?.click();
    } else if (wasOnline && menuToggle?.getAttribute('aria-expanded') === 'true') {
      setMenuState(false);
    }
    browserNodeOnline = false;
    header?.classList.remove('network-online');
    syncMobileMenuTarget(false);
    setNetworkAction('joining');
    setJoinStage('Syncing with network', 88);
    appendNetworkLog('Syncing with network');
  }

  if (detail.newBlock) {
    checkNetwork();
    refreshNodePeers();
  }

  window.setTimeout(renderStoredBrowser, 0);
}

window.addEventListener('saito-websitex-status', (event) => {
  applyBrowserNetworkStatus(event.detail);
});

async function loadSaitoBrowserBundle() {
  const existingScript = document.querySelector('script[data-saito-browser-bundle]');
  if (existingScript) {
    window.saitoWebsitex?.requestStatus?.();
    return;
  }

  const previousOnload = window.onload;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/saito/saito.js?websitex=20260902-6';
    script.dataset.saitoBrowserBundle = 'true';
    script.onload = async () => {
      setJoinStage('Creating identity', 45);
      appendNetworkLog('Creating identity');

      const saitoOnload = window.onload;
      if (
        document.readyState === 'complete' &&
        typeof saitoOnload === 'function' &&
        saitoOnload !== previousOnload
      ) {
        await saitoOnload();
      }
      resolve();
    };
    script.onerror = () => reject(new Error('Could not download saito.js'));
    document.body.append(script);
  });
}

async function startSaitoNode() {
  if (browserNodeLoading || browserNodeStarted) {
    window.saitoWebsitex?.requestStatus?.();
    return;
  }

  browserNodeLoading = true;
  setNetworkAction('joining');
  networkLog.textContent = '';
  setJoinStage('Initializing your Saito node', 10);
  appendNetworkLog('Downloading saito.js');
  captureSaitoLogs();
  window.Pace?.restart?.();

  try {
    await loadSaitoBrowserBundle();
    window.setTimeout(() => {
      renderStoredBrowser();
      window.saitoWebsitex?.requestStatus?.();
    }, 250);
  } catch (error) {
    browserNodeLoading = false;
    setJoinStage('Unable to join the network', 100, 'error');
    appendNetworkLog(error.message);
    setNetworkAction('ready');
    window.Pace?.stop?.();
    restoreConsole?.();
  }
}

function scheduleNetworkRefresh() {
  window.clearTimeout(networkRefreshTimer);
  const dueIn = lastBlockTimestamp
    ? lastBlockTimestamp + heartbeatInterval - Date.now() + 350
    : heartbeatInterval;
  const delay = dueIn > 1000 ? Math.min(dueIn, heartbeatInterval) : 5000;
  networkRefreshTimer = window.setTimeout(checkNetwork, delay);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json();
}

function moduleUrl(fileName) {
  const pathName = window.location.pathname;
  const basePath = /\/[^/]+\.[^/]+$/.test(pathName)
    ? pathName.replace(/[^/]+$/, '')
    : pathName.endsWith('/')
      ? pathName
      : `${pathName}/`;
  return `${basePath}${fileName}`;
}

async function refreshNodePeers() {
  if (!browserNodeOnline || nodePeersRefreshing) {
    return;
  }

  nodePeersRefreshing = true;
  try {
    const status = await fetchJson(moduleUrl('network-status'));
    const peers = Array.isArray(status.peers) ? status.peers : [];
    const endpoint = status.endpoint || {};
    const upstreamPeer = browserUpstreamPeer
      ? {
          ...endpoint,
          ...browserUpstreamPeer,
          publicKey: browserUpstreamPeer.publicKey || endpoint.publicKey || status.publicKey || '',
          connected: true
        }
      : {
          ...endpoint,
          publicKey: endpoint.publicKey || status.publicKey || '',
          connected: true
        };
    const hasUpstreamPeer = peerAddress(upstreamPeer) || upstreamPeer.publicKey;
    if (hasUpstreamPeer) {
      browserUpstreamPeer = upstreamPeer;
    }
    renderPeers(
      hasUpstreamPeer ? [upstreamPeer, ...peers] : peers,
      'The node has no live peers yet.'
    );
    networkUpdated.textContent = `Peers updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    // Keep the browser's last known peer list if the node snapshot is temporarily unavailable.
  } finally {
    nodePeersRefreshing = false;
  }
}

async function checkNetwork() {
  if (networkChecking || !networkDashboard) {
    return;
  }

  networkChecking = true;
  networkState.textContent = 'CHECKING';
  networkState.classList.remove('is-live', 'is-error');

  try {
    const options = await fetchJson('/options');
    const blockchain = options.blockchain || {};
    const consensus = options.consensus || {};
    const nextHeight = Number(blockchain.last_block_id);
    const nextTimestamp = Number(blockchain.last_timestamp);
    const isNewBlock =
      Number.isFinite(nextHeight) &&
      currentBlockHeight !== undefined &&
      nextHeight > currentBlockHeight;

    if (Number.isFinite(nextHeight)) {
      currentBlockHeight = nextHeight;
      blockHeight.textContent = nextHeight.toLocaleString();
    }

    if (Number.isFinite(nextTimestamp) && nextTimestamp > 0) {
      lastBlockTimestamp = nextTimestamp;
    }

    if (Number(consensus.heartbeat_interval) > 0) {
      heartbeatInterval = Number(consensus.heartbeat_interval);
    }

    if (!browserNodeStarted) {
      renderPeers([], 'Join the network to see live peers.');
      trackBrowserUpstream([], browserNodeLoading ? 'syncing' : 'offline');
    }
    updateBlockClocks();

    if (isNewBlock) {
      pulseForBlock();
    }

    networkState.textContent = 'LIVE';
    networkState.classList.add('is-live');
    networkUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    scheduleNetworkRefresh();
  } catch (error) {
    networkState.textContent = 'UNAVAILABLE';
    networkState.classList.add('is-error');
    networkUpdated.textContent = 'Network status could not be reached. Try again.';
    window.clearTimeout(networkRefreshTimer);
    networkRefreshTimer = window.setTimeout(checkNetwork, 10000);
  } finally {
    networkChecking = false;
  }
}

networkCheck?.addEventListener('click', () => {
  if (browserNodeOnline) {
    appsSection?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });
    return;
  }

  startSaitoNode();
});
window.setInterval(updateBlockClocks, 500);
setNetworkAction('ready');
renderStoredBrowser();
checkNetwork();

if (storedBrowser.present) {
  window.setTimeout(startSaitoNode, 0);
}

const assetButtons = document.querySelectorAll('[data-asset]');
const assetCard = document.querySelector('[data-asset-card]');
const assetName = document.querySelector('[data-asset-name]');
const assetType = document.querySelector('[data-asset-type-output]');
const assetCode = document.querySelector('[data-asset-code]');
const lifecycleSteps = document.querySelectorAll('.asset-lifecycle li');
const assetStyles = {
  'Passes and Subscriptions': { hue: 348, code: '8F2A · 16C4' },
  'Apps and Games': { hue: 268, code: '4D91 · A820' },
  'Extensions and Themes': { hue: 214, code: '72BE · 09F1' },
  Tokens: { hue: 164, code: 'C308 · 4AA7' },
  'Art, Certificates and Documents': { hue: 36, code: '91D5 · E70B' }
};
let lifecycleTimers = [];

function animateLifecycle() {
  lifecycleTimers.forEach((timer) => window.clearTimeout(timer));
  lifecycleTimers = [];
  lifecycleSteps.forEach((step) => step.classList.remove('is-active'));

  lifecycleSteps.forEach((step, index) => {
    lifecycleTimers.push(
      window.setTimeout(
        () => step.classList.add('is-active'),
        (prefersReducedMotion ? 20 : 220) * index
      )
    );
  });
}

assetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedAsset = button.dataset.asset;
    const style = assetStyles[selectedAsset];

    assetButtons.forEach((candidate) => {
      const isSelected = candidate === button;
      candidate.classList.toggle('is-active', isSelected);
      candidate.setAttribute('aria-pressed', String(isSelected));
    });

    assetName.textContent = selectedAsset;
    assetType.textContent = button.dataset.assetType;
    assetCode.textContent = style.code;
    assetCard.style.setProperty('--asset-hue', style.hue);
    animateLifecycle();
  });
});

const copyCodeButton = document.querySelector('[data-copy-code]');
const codeExample = document.querySelector('[data-code-example]');

copyCodeButton?.addEventListener('click', async () => {
  const code = codeExample?.textContent || '';

  try {
    await navigator.clipboard.writeText(code);
    copyCodeButton.textContent = 'Copied';
  } catch (error) {
    copyCodeButton.textContent = 'Select code to copy';
  }

  window.setTimeout(() => {
    copyCodeButton.textContent = 'Copy';
  }, 1800);
});

document.querySelector('[data-current-year]').textContent = new Date().getFullYear();

const sineRoutePath = document.querySelector('#route-motion-path');
const sineRoutePackets = [...document.querySelectorAll('[data-route-packet]')];
const sineRoutePeers = [...document.querySelectorAll('[data-route-peer]')].map((peer) => ({
  progress: Number(peer.dataset.routeProgress),
  icon: peer.querySelector('.route-icon'),
  pulseAnimation: null
}));

if (sineRoutePath && sineRoutePackets.length && sineRoutePeers.length) {
  const routeCrossingDuration = 3600;
  const routeLength = sineRoutePath.getTotalLength();
  const packets = sineRoutePackets.map((packet) => ({
    element: packet,
    direction: Number(packet.dataset.routeDirection),
    phase: Number(packet.dataset.routePhase),
    previousProgress: null
  }));

  function normalizeRouteProgress(progress) {
    return ((progress % 1) + 1) % 1;
  }

  function passedRoutePeer(previousProgress, progress, peerProgress, direction) {
    if (direction > 0) {
      return progress >= previousProgress
        ? peerProgress > previousProgress && peerProgress <= progress
        : peerProgress > previousProgress || peerProgress <= progress;
    }

    return progress <= previousProgress
      ? peerProgress < previousProgress && peerProgress >= progress
      : peerProgress < previousProgress || peerProgress >= progress;
  }

  function pulseRoutePeer(peer) {
    if (!peer.icon?.animate) {
      return;
    }

    peer.pulseAnimation?.cancel();
    peer.pulseAnimation = peer.icon.animate(
      [
        {
          borderColor: 'rgba(255, 255, 255, 0.2)',
          boxShadow: 'none',
          transform: 'scale(1)'
        },
        {
          borderColor: '#ff9e8f',
          boxShadow: '0 0 0 0.35rem rgba(247, 31, 61, 0.15), 0 0 1.4rem rgba(247, 31, 61, 0.8)',
          transform: 'scale(1.12)',
          offset: 0.22
        },
        {
          borderColor: 'rgba(255, 255, 255, 0.2)',
          boxShadow: 'none',
          transform: 'scale(1)'
        }
      ],
      { duration: 440, easing: 'ease-out' }
    );
  }

  let routeStartTime;
  let previousRouteFrameTime;

  function animateSineRoute(timestamp) {
    routeStartTime ??= timestamp;
    const elapsed = (timestamp - routeStartTime) / routeCrossingDuration;
    const frameGap = previousRouteFrameTime === undefined ? 0 : timestamp - previousRouteFrameTime;

    packets.forEach((packet) => {
      const cycleProgress = normalizeRouteProgress(elapsed + packet.phase);
      const progress = packet.direction > 0 ? cycleProgress : 1 - cycleProgress;
      const point = sineRoutePath.getPointAtLength(progress * routeLength);
      const endpointDistance = Math.min(progress, 1 - progress);

      packet.element.setAttribute('cx', point.x.toFixed(2));
      packet.element.setAttribute('cy', point.y.toFixed(2));
      packet.element.style.opacity = Math.min(1, endpointDistance / 0.035).toFixed(2);

      if (packet.previousProgress !== null && frameGap < 100) {
        sineRoutePeers.forEach((peer) => {
          if (passedRoutePeer(packet.previousProgress, progress, peer.progress, packet.direction)) {
            pulseRoutePeer(peer);
          }
        });
      }

      packet.previousProgress = progress;
    });

    previousRouteFrameTime = timestamp;
    window.requestAnimationFrame(animateSineRoute);
  }

  window.requestAnimationFrame(animateSineRoute);
}

const heroNetworkGraph = document.querySelector('[data-hero-network]');
const heroConnectionLayer = heroNetworkGraph?.querySelector('[data-hero-connections]');
const heroNodeLayer = heroNetworkGraph?.querySelector('[data-hero-nodes]');

if (heroNetworkGraph && heroConnectionLayer && heroNodeLayer) {
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const nodeFadeDuration = 1950;
  const initialNodeCount = 7;
  const minimumNodeCount = 6;
  const maximumNodeCount = 8;
  const networkRadius = 42;
  const positionCandidateCount = 96;
  const heroNodes = new Map();
  const heroConnections = new Map();
  let nextHeroNodeId = 0;
  let connectionVersion = 0;
  const initialAngleOffset = Math.random() * Math.PI * 2;

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(svgNamespace, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    return element;
  }

  function hashNetworkValue(value) {
    return [...String(value)].reduce((hash, character) => {
      return (hash * 31 + character.charCodeAt(0)) >>> 0;
    }, 7);
  }

  function connectionKey(leftNode, rightNode) {
    return [leftNode.id, rightNode.id].sort((left, right) => left - right).join('-');
  }

  function buildHeroConnections(nodes) {
    if (nodes.length < 3) {
      return [];
    }

    const degrees = new Map(nodes.map((node) => [node.id, 0]));
    const pairs = new Map();
    const orderedNodes = [...nodes].sort((left, right) => {
      const leftAngle = Math.atan2(left.y - 50, left.x - 50);
      const rightAngle = Math.atan2(right.y - 50, right.x - 50);
      return leftAngle - rightAngle;
    });

    function addPair(leftNode, rightNode) {
      const key = connectionKey(leftNode, rightNode);
      if (leftNode === rightNode || pairs.has(key)) {
        return false;
      }

      pairs.set(key, [leftNode, rightNode]);
      degrees.set(leftNode.id, degrees.get(leftNode.id) + 1);
      degrees.set(rightNode.id, degrees.get(rightNode.id) + 1);
      return true;
    }

    // The ring guarantees two links per node; optional chords raise that count without exceeding four.
    orderedNodes.forEach((node, index) => {
      addPair(node, orderedNodes[(index + 1) % orderedNodes.length]);
    });

    const targetDegrees = new Map(
      nodes.map((node) => [node.id, 2 + (hashNetworkValue(node.id + connectionVersion) % 3)])
    );
    const candidates = [];
    nodes.forEach((leftNode, leftIndex) => {
      nodes.slice(leftIndex + 1).forEach((rightNode) => {
        const key = connectionKey(leftNode, rightNode);
        if (!pairs.has(key)) {
          candidates.push([leftNode, rightNode]);
        }
      });
    });
    candidates.sort((left, right) => {
      return (
        hashNetworkValue(`${connectionKey(...left)}-${connectionVersion}`) -
        hashNetworkValue(`${connectionKey(...right)}-${connectionVersion}`)
      );
    });
    candidates.forEach(([leftNode, rightNode]) => {
      if (
        degrees.get(leftNode.id) < targetDegrees.get(leftNode.id) &&
        degrees.get(rightNode.id) < targetDegrees.get(rightNode.id) &&
        degrees.get(leftNode.id) < 4 &&
        degrees.get(rightNode.id) < 4
      ) {
        addPair(leftNode, rightNode);
      }
    });

    return [...pairs.values()];
  }

  function addHeroConnection(leftNode, rightNode) {
    const key = connectionKey(leftNode, rightNode);
    const pathValue = `M ${leftNode.x} ${leftNode.y} L ${rightNode.x} ${rightNode.y}`;
    const connection = createSvgElement('g', {
      class: 'hero-network-connection',
      'data-nodes': key
    });
    const line = createSvgElement('path', {
      class: 'hero-network-line',
      d: pathValue
    });
    connection.append(line);

    const pulseHash = hashNetworkValue(key);
    const pulse = createSvgElement('path', {
      class: 'hero-network-pulse',
      d: pathValue,
      pathLength: '100'
    });
    pulse.style.setProperty('--pulse-delay', `-${(pulseHash % 40) / 10}s`);
    connection.append(pulse);

    heroConnectionLayer.append(connection);
    heroConnections.set(key, connection);
    window.requestAnimationFrame(() => connection.classList.add('is-visible'));
  }

  function reconcileHeroConnections() {
    const activeNodes = [...heroNodes.values()].filter((node) => node.state === 'active');
    const desiredPairs = buildHeroConnections(activeNodes);
    const desiredKeys = new Set(
      desiredPairs.map(([leftNode, rightNode]) => connectionKey(leftNode, rightNode))
    );

    heroConnections.forEach((connection, key) => {
      if (desiredKeys.has(key)) {
        return;
      }

      heroConnections.delete(key);
      connection.classList.remove('is-visible');
      window.setTimeout(() => connection.remove(), nodeFadeDuration);
    });

    desiredPairs.forEach(([leftNode, rightNode]) => {
      if (!heroConnections.has(connectionKey(leftNode, rightNode))) {
        addHeroConnection(leftNode, rightNode);
      }
    });
  }

  function createRandomHeroNodePosition() {
    const existingNodes = [...heroNodes.values()];
    let bestCandidate = null;
    let bestDistance = -1;

    for (let attempt = 0; attempt < positionCandidateCount; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distanceFromCenter = Math.sqrt(Math.random()) * networkRadius;
      const candidate = {
        x: Number((50 + Math.cos(angle) * distanceFromCenter).toFixed(2)),
        y: Number((50 + Math.sin(angle) * distanceFromCenter).toFixed(2))
      };
      const closestNodeDistance = existingNodes.length
        ? Math.min(
            ...existingNodes.map((node) => Math.hypot(candidate.x - node.x, candidate.y - node.y))
          )
        : Number.POSITIVE_INFINITY;

      if (closestNodeDistance > bestDistance) {
        bestCandidate = candidate;
        bestDistance = closestNodeDistance;
      }
    }

    return bestCandidate;
  }

  function createInitialHeroNodePosition(index) {
    const sectorAngle = (Math.PI * 2) / initialNodeCount;
    const angleJitter = (Math.random() - 0.5) * sectorAngle * 0.28;
    const angle = initialAngleOffset + index * sectorAngle + angleJitter;
    const distanceFromCenter = networkRadius * (0.86 + Math.random() * 0.14);

    return {
      x: Number((50 + Math.cos(angle) * distanceFromCenter).toFixed(2)),
      y: Number((50 + Math.sin(angle) * distanceFromCenter).toFixed(2))
    };
  }

  function appendHeroNode(position, visibleDelay = 0) {
    const { x, y } = position;
    const id = nextHeroNodeId;
    nextHeroNodeId += 1;
    const element = createSvgElement('g', {
      class: 'hero-network-node',
      'data-node': id,
      transform: `translate(${x} ${y})`
    });
    const halo = createSvgElement('circle', {
      class: 'hero-network-node-halo',
      r: '4.25'
    });
    const background = createSvgElement('circle', {
      class: 'hero-network-node-core',
      r: '3.2'
    });
    const logo = createSvgElement('image', {
      href: '/saito/img/saito-cube.svg',
      x: '-1.65',
      y: '-1.89',
      width: '3.3',
      height: '3.78'
    });
    const node = { id, x, y, state: 'entering', element };

    element.append(halo, background, logo);
    heroNodeLayer.append(element);
    heroNodes.set(id, node);
    window.setTimeout(() => element.classList.add('is-visible'), visibleDelay);
    return node;
  }

  function addPeriodicHeroNode() {
    if (heroNodes.size >= maximumNodeCount) {
      return;
    }

    const node = appendHeroNode(createRandomHeroNodePosition());
    window.setTimeout(() => {
      node.state = 'active';
      connectionVersion += 1;
      reconcileHeroConnections();
    }, nodeFadeDuration);
  }

  function removePeriodicHeroNode() {
    const activeNodes = [...heroNodes.values()].filter((node) => node.state === 'active');
    if (activeNodes.length <= minimumNodeCount) {
      return;
    }

    const node = activeNodes[Math.floor(Math.random() * activeNodes.length)];
    node.state = 'leaving';
    node.element.classList.remove('is-visible');
    connectionVersion += 1;
    reconcileHeroConnections();
    window.setTimeout(() => {
      node.element.remove();
      heroNodes.delete(node.id);
    }, nodeFadeDuration);
  }

  function scheduleHeroNodeLifecycle() {
    const delay = 1000 + Math.random() * 2000;
    window.setTimeout(() => {
      const activeNodeCount = [...heroNodes.values()].filter(
        (node) => node.state === 'active'
      ).length;
      const canAddNode = heroNodes.size < maximumNodeCount;
      const canRemoveNode = activeNodeCount > minimumNodeCount;

      if (canAddNode && (!canRemoveNode || Math.random() < 0.5)) {
        addPeriodicHeroNode();
      } else if (canRemoveNode) {
        removePeriodicHeroNode();
      }
      scheduleHeroNodeLifecycle();
    }, delay);
  }

  for (let index = 0; index < initialNodeCount; index += 1) {
    appendHeroNode(createInitialHeroNodePosition(index), index * 80);
  }

  window.setTimeout(
    () => {
      heroNodes.forEach((node) => {
        node.state = 'active';
      });
      reconcileHeroConnections();
      scheduleHeroNodeLifecycle();
    },
    nodeFadeDuration + initialNodeCount * 80
  );
}

const heroNetwork = document.querySelector('.hero-network');

if (
  heroNetwork &&
  !prefersReducedMotion &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches
) {
  window.addEventListener(
    'pointermove',
    (event) => {
      const horizontal = (event.clientX / window.innerWidth - 0.5) * 8;
      const vertical = (event.clientY / window.innerHeight - 0.5) * 8;
      heroNetwork.style.transform = `translate3d(${horizontal}px, ${vertical}px, 0)`;
    },
    { passive: true }
  );
}
