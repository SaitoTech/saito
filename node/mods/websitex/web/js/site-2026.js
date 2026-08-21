// Progressive enhancement for the Websitex landing-page experiment.
document.documentElement.classList.add('has-js');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const header = document.querySelector('[data-site-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileNavigation = document.querySelector('[data-mobile-nav]');
const mobileNavigationLinks = mobileNavigation?.querySelectorAll('a') || [];
const desktopNavigationLinks = document.querySelectorAll('.desktop-nav a');
const mobileAppDock = document.querySelector('[data-open-apps]');
const appsSection = document.querySelector('#apps');

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
  setMenuState(menuToggle.getAttribute('aria-expanded') !== 'true');
});

mobileNavigationLinks.forEach((link) => {
  link.addEventListener('click', () => setMenuState(false));
});

window.addEventListener('resize', () => {
  if (window.innerWidth > 820 && menuToggle?.getAttribute('aria-expanded') === 'true') {
    setMenuState(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle?.getAttribute('aria-expanded') === 'true') {
    setMenuState(false);
  }

  if (
    event.key === 'Tab' &&
    menuToggle?.getAttribute('aria-expanded') === 'true' &&
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

openTrafficDialog?.addEventListener('click', () => setTrafficDialogState(true));
closeTrafficDialog?.addEventListener('click', () => setTrafficDialogState(false));

trafficDialog?.addEventListener('close', () => {
  document.body.classList.remove('traffic-dialog-open');
  openTrafficDialog?.focus();
});

trafficDialog?.addEventListener('click', (event) => {
  if (event.target === trafficDialog) {
    setTrafficDialogState(false);
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
const primaryNode = document.querySelector('[data-primary-node]');
const primaryNodeStatus = document.querySelector('[data-primary-node-status]');
const peerCount = document.querySelector('[data-peer-count]');
const peerList = document.querySelector('[data-peer-list]');
const networkUpdated = document.querySelector('[data-network-updated]');
const heroStatus = document.querySelector('[data-hero-status]');
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

function compactKey(publicKey) {
  if (!publicKey || publicKey.length < 18) {
    return publicKey || '';
  }

  return `${publicKey.slice(0, 9)}…${publicKey.slice(-7)}`;
}

function renderPeers(peers, emptyMessage = 'No peer nodes are visible yet.', excludedKeys = []) {
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
    const identifier = address || key;

    if (!identifier || ownKeys.has(key) || seen.has(identifier)) {
      return;
    }

    seen.add(identifier);
    uniquePeers.push({ ...peer, address, publicKey: key });
  });

  peerList.replaceChildren();
  peerCount.textContent = `${uniquePeers.length} visible`;

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
    const status = document.createElement('span');
    label.textContent = peer.address || peer.publicKey || 'Peer';
    label.title = peer.publicKey || peer.address || '';
    status.textContent = peer.connected
      ? 'CONNECTED'
      : String(peer.status || peer.synctype || 'AVAILABLE').toUpperCase();
    item.append(label, status);
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

function renderPrimaryNode(peers, stage = 'offline') {
  const connectedPeer = peers.find((peer) => peer.connected);
  const candidate = connectedPeer || (stage === 'syncing' ? peers[0] : null);

  if (!candidate) {
    primaryNode.textContent = 'Not connected';
    primaryNode.title = '';
    primaryNodeStatus.textContent = stage === 'syncing' ? 'CONNECTING' : 'OFFLINE';
    primaryNodeStatus.classList.remove('is-live');
    return;
  }

  const address = (
    peerAddress(candidate) ||
    compactKey(candidate.publicKey) ||
    'Peer node'
  ).replace(/^https?:\/\//i, '');
  primaryNode.textContent = address;
  primaryNode.title = candidate.publicKey || address;
  primaryNodeStatus.textContent = connectedPeer ? 'CONNECTED' : 'CONNECTING';
  primaryNodeStatus.classList.toggle('is-live', Boolean(connectedPeer));
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

  renderPrimaryNode(peersToRender, detail.stage || 'syncing');

  if (isOnline) {
    networkMetrics.hidden = false;
    renderPeers(connectedBrowserPeers, 'The node has no active peers yet.');
    const wasOnline = browserNodeOnline;
    browserNodeLoading = false;
    setJoinStage('On line', 100, 'complete');
    if (!wasOnline) {
      appendNetworkLog('On line');
    }
    browserNodeOnline = true;
    header?.classList.add('network-online');
    setNetworkAction('online');
    refreshNodePeers();
    window.Pace?.stop?.();
  } else {
    renderPeers([], 'Connecting to peer nodes…');
    const wasOnline = browserNodeOnline;
    browserNodeLoading = true;
    if (wasOnline && menuToggle?.getAttribute('aria-expanded') === 'true') {
      setMenuState(false);
    }
    browserNodeOnline = false;
    header?.classList.remove('network-online');
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
    script.src = '/saito/saito.js';
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
    renderPeers(peers, 'The node has no active peers yet.', [status.publicKey]);
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
      renderPeers([], 'Join the network to see peer nodes.');
      renderPrimaryNode([], browserNodeLoading ? 'syncing' : 'offline');
    }
    updateBlockClocks();

    if (isNewBlock) {
      pulseForBlock();
    }

    networkState.textContent = 'LIVE';
    networkState.classList.add('is-live');
    networkUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
    heroStatus.textContent = 'NETWORK LIVE';
    scheduleNetworkRefresh();
  } catch (error) {
    networkState.textContent = 'UNAVAILABLE';
    networkState.classList.add('is-error');
    networkUpdated.textContent = 'Network status could not be reached. Try again.';
    heroStatus.textContent = 'BROWSER READY';
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
